import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _


# Maps Mandi entry types to ERPNext Stock Entry purpose and warehouse direction
ENTRY_TYPE_MAP = {
	"Opening Stock": {"purpose": "Material Receipt", "wh_field": "t_warehouse"},
	"Receipt": {"purpose": "Material Receipt", "wh_field": "t_warehouse"},
	"Adjustment (Increase)": {"purpose": "Material Receipt", "wh_field": "t_warehouse"},
	"Issue": {"purpose": "Material Issue", "wh_field": "s_warehouse"},
	"Adjustment (Decrease)": {"purpose": "Material Issue", "wh_field": "s_warehouse"},
}


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
		self.create_erp_stock_entry()

	def on_cancel(self):
		self.db_set("status", "Cancelled")
		self.cancel_erp_stock_entry()

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

	def create_erp_stock_entry(self):
		"""Create a corresponding ERPNext Stock Entry on submit."""
		mapping = ENTRY_TYPE_MAP.get(self.entry_type)
		if not mapping:
			return

		try:
			company = self.company or frappe.db.get_value("Warehouse", self.warehouse, "company")
			if not company:
				frappe.msgprint(
					_("Warning: No company found for warehouse {0}. ERPNext Stock Entry not created.").format(
						self.warehouse
					),
					indicator="orange",
					alert=True,
				)
				return

			se = frappe.new_doc("Stock Entry")
			se.set_posting_time = 1
			se.posting_date = self.posting_date
			se.purpose = mapping["purpose"]
			se.company = company
			se.remarks = "Auto-created from Mandi Stock Entry {0}".format(self.name)

			# Aggregate items by item_code, converting packs to KG
			item_kg_map = {}
			for row in self.items:
				if row.item not in item_kg_map:
					item_kg_map[row.item] = 0
				item_kg_map[row.item] += flt(row.qty) * flt(row.pack_weight_kg)

			cost_center = frappe.get_cached_value("Company", company, "cost_center")
			expense_account = frappe.get_cached_value("Company", company, "stock_adjustment_account")

			# Determine the UOM name (ERPNext may have "Kg" or "KG")
			uom_name = get_kg_uom()

			for item_code, total_kg in item_kg_map.items():
				item_row = {
					"item_code": item_code,
					"qty": flt(total_kg, 3),
					"uom": uom_name,
					"stock_uom": uom_name,
					"conversion_factor": 1.0,
					"transfer_qty": flt(total_kg, 3),
					"allow_zero_valuation_rate": 1,
					"basic_rate": 0,
				}
				if cost_center:
					item_row["cost_center"] = cost_center
				if expense_account:
					item_row["expense_account"] = expense_account

				item_row[mapping["wh_field"]] = self.warehouse
				se.append("items", item_row)

			se.set_stock_entry_type()
			se.insert(ignore_permissions=True)
			se.submit()

			self.db_set("erp_stock_entry", se.name)

			frappe.msgprint(
				_("ERPNext Stock Entry {0} created.").format(
					'<a href="/app/stock-entry/{0}">{0}</a>'.format(se.name)
				),
				indicator="green",
				alert=True,
			)
		except Exception as e:
			frappe.log_error(
				title="ERPNext Stock Entry creation failed for {0}".format(self.name),
				message=frappe.get_traceback(),
			)
			frappe.msgprint(
				_("Warning: Could not create ERPNext Stock Entry. Error: {0}").format(str(e)),
				indicator="orange",
				alert=True,
			)

	def cancel_erp_stock_entry(self):
		"""Cancel the linked ERPNext Stock Entry when this entry is cancelled."""
		if not self.erp_stock_entry:
			return

		try:
			se = frappe.get_doc("Stock Entry", self.erp_stock_entry)
			if se.docstatus == 1:
				se.cancel()
				frappe.msgprint(
					_("ERPNext Stock Entry {0} cancelled.").format(self.erp_stock_entry),
					indicator="orange",
					alert=True,
				)
		except Exception as e:
			frappe.log_error(
				title="ERPNext Stock Entry cancellation failed for {0}".format(self.name),
				message=frappe.get_traceback(),
			)
			frappe.msgprint(
				_("Warning: Could not cancel ERPNext Stock Entry {0}. Error: {1}").format(
					self.erp_stock_entry, str(e)
				),
				indicator="orange",
				alert=True,
			)


def get_kg_uom():
	"""Get the correct UOM name for KG (ERPNext may have 'Kg' or 'KG')."""
	if frappe.db.exists("UOM", "Kg"):
		return "Kg"
	if frappe.db.exists("UOM", "KG"):
		return "KG"
	return "Kg"


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


def get_default_warehouse():
	"""Get the default warehouse for Mandi operations."""
	company = "Trustbit Mandi"
	abbr = frappe.get_cached_value("Company", company, "abbr")
	if not abbr:
		return None

	wh_name = "Stores - {0}".format(abbr)
	if frappe.db.exists("Warehouse", wh_name):
		return wh_name

	# Fallback: any non-group warehouse for the company
	return frappe.db.get_value(
		"Warehouse",
		{"company": company, "is_group": 0},
		"name",
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
	mse.warehouse = get_default_warehouse()
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
