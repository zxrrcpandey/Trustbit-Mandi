import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _


class MandiStockEntry(Document):
	def before_save(self):
		self.validate_items()
		self.calculate_totals()
		self.set_status()

	def set_status(self):
		if self.docstatus == 0:
			self.status = "Draft"
		elif self.docstatus == 1:
			self.status = "Submitted"
		elif self.docstatus == 2:
			self.status = "Cancelled"

	def validate_items(self):
		if not self.items:
			frappe.throw(_("At least one item row is required."))

		for row in self.items:
			if flt(row.qty) <= 0:
				frappe.throw(_("Row {0}: Qty must be greater than 0.").format(row.idx))
			row.kg = flt(row.qty) * flt(row.pack_weight_kg)

		seen = set()
		for row in self.items:
			key = (row.item, row.pack_size)
			if key in seen:
				frappe.throw(
					_("Row {0}: Duplicate Item + Pack Size ({1} + {2}). Please consolidate into one row.").format(
						row.idx, row.item, row.pack_size
					)
				)
			seen.add(key)

	def calculate_totals(self):
		self.total_qty = sum(flt(row.qty) for row in self.items)
		self.total_kg = sum(flt(row.kg) for row in self.items)
		self.total_items = len(self.items)

	def on_submit(self):
		self.db_set("status", "Submitted")
		self.check_negative_stock()

	def on_cancel(self):
		self.db_set("status", "Cancelled")

	def check_negative_stock(self):
		if self.entry_type not in ("Issue", "Adjustment (Decrease)"):
			return
		for row in self.items:
			balance = get_stock_balance(row.item, row.pack_size)
			if balance < 0:
				frappe.msgprint(
					_("Warning: {0} ({1}) stock balance is {2} packs (negative).").format(
						row.item, row.pack_size, balance
					),
					indicator="orange",
					alert=True,
				)


def get_stock_balance(item, pack_size, posting_date=None):
	conditions = ["mse.docstatus = 1", "msei.item = %s", "msei.pack_size = %s"]
	values = [item, pack_size]

	if posting_date:
		conditions.append("mse.posting_date <= %s")
		values.append(posting_date)

	result = frappe.db.sql(
		"""
		SELECT COALESCE(SUM(
			CASE
				WHEN mse.entry_type IN ('Opening Stock', 'Receipt', 'Adjustment (Increase)')
				THEN msei.qty
				ELSE -msei.qty
			END
		), 0) as balance
		FROM `tabMandi Stock Entry Item` msei
		INNER JOIN `tabMandi Stock Entry` mse ON mse.name = msei.parent
		WHERE {conditions}
	""".format(
			conditions=" AND ".join(conditions)
		),
		values,
	)

	return flt(result[0][0]) if result else 0


@frappe.whitelist()
def get_current_stock(item=None, pack_size=None):
	conditions = ["mse.docstatus = 1"]
	values = []

	if item:
		conditions.append("msei.item = %s")
		values.append(item)
	if pack_size:
		conditions.append("msei.pack_size = %s")
		values.append(pack_size)

	return frappe.db.sql(
		"""
		SELECT
			msei.item,
			MAX(msei.item_name) as item_name,
			msei.pack_size,
			MAX(msei.pack_weight_kg) as pack_weight_kg,
			SUM(
				CASE
					WHEN mse.entry_type IN ('Opening Stock', 'Receipt', 'Adjustment (Increase)')
					THEN msei.qty
					ELSE -msei.qty
				END
			) as balance_qty,
			SUM(
				CASE
					WHEN mse.entry_type IN ('Opening Stock', 'Receipt', 'Adjustment (Increase)')
					THEN msei.kg
					ELSE -msei.kg
				END
			) as balance_kg
		FROM `tabMandi Stock Entry Item` msei
		INNER JOIN `tabMandi Stock Entry` mse ON mse.name = msei.parent
		WHERE {conditions}
		GROUP BY msei.item, msei.pack_size
		ORDER BY msei.item ASC, MAX(msei.pack_weight_kg) ASC
	""".format(
			conditions=" AND ".join(conditions)
		),
		values,
		as_dict=True,
	)


@frappe.whitelist()
def create_stock_entry_from_delivery(deal_delivery_name):
	dd = frappe.get_doc("Deal Delivery", deal_delivery_name)

	if dd.docstatus != 1:
		frappe.throw(_("Deal Delivery must be submitted to create stock entry."))

	existing = frappe.db.exists(
		"Mandi Stock Entry", {"deal_delivery": deal_delivery_name, "docstatus": ["in", [0, 1]]}
	)
	if existing:
		return existing

	mse = frappe.new_doc("Mandi Stock Entry")
	mse.posting_date = dd.delivery_date
	mse.entry_type = "Issue"
	mse.deal_delivery = deal_delivery_name
	mse.remarks = "Auto-created from Deal Delivery {0}".format(deal_delivery_name)

	item_map = {}
	for row in dd.items:
		key = (row.item, row.pack_size)
		if key not in item_map:
			item_map[key] = {
				"item": row.item,
				"pack_size": row.pack_size,
				"pack_weight_kg": flt(row.pack_weight_kg),
				"qty": 0,
			}
		item_map[key]["qty"] += flt(row.deliver_qty)

	for vals in item_map.values():
		mse.append(
			"items",
			{
				"item": vals["item"],
				"pack_size": vals["pack_size"],
				"pack_weight_kg": vals["pack_weight_kg"],
				"qty": vals["qty"],
			},
		)

	mse.insert(ignore_permissions=True)
	mse.submit()

	return mse.name
