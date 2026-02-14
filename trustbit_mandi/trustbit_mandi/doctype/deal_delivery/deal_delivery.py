# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class DealDelivery(Document):
	def before_save(self):
		self.validate_items()
		self.calculate_totals()

	def validate_items(self):
		for row in self.items:
			deal = frappe.get_doc("Deal", row.soda)

			if deal.status == "Cancelled":
				frappe.throw("Deal {0} is cancelled. Cannot deliver against it.".format(row.soda))

			# Find the specific Deal Item row
			deal_item_row = None
			for di in deal.items:
				if di.name == row.deal_item:
					deal_item_row = di
					break

			if not deal_item_row:
				frappe.throw("Deal Item {0} not found in Deal {1}.".format(
					row.deal_item, row.soda))

			if deal_item_row.item_status == "Delivered":
				frappe.throw("Deal {0}, Item {1} is already fully delivered.".format(
					row.soda, deal_item_row.item))

			other_delivered = get_other_delivered_qty_for_item(
				row.soda, row.deal_item, self.name)
			available = flt(deal_item_row.qty) - flt(other_delivered)

			if flt(row.deliver_qty) > available:
				frappe.throw(
					"Deliver Qty ({0}) for Deal {1} Item {2} exceeds available pending qty ({3})".format(
						row.deliver_qty, row.soda, deal_item_row.item, available
					)
				)

	def calculate_totals(self):
		total_qty = 0
		total_amount = 0
		for row in self.items:
			row.amount = flt(row.deliver_qty) * flt(row.rate)
			total_qty += flt(row.deliver_qty)
			total_amount += flt(row.amount)

		self.total_delivery_qty = total_qty
		self.total_amount = total_amount

	def on_update(self):
		self.update_deal_statuses()

	def on_trash(self):
		self._affected_deals = set()
		for row in self.items:
			self._affected_deals.add(row.soda)

	def after_delete(self):
		for deal_name in getattr(self, '_affected_deals', set()):
			try:
				deal = frappe.get_doc("Deal", deal_name)
				deal.update_delivery_status()
			except frappe.DoesNotExistError:
				pass

	def update_deal_statuses(self):
		affected_deals = set()
		for row in self.items:
			affected_deals.add(row.soda)

		for deal_name in affected_deals:
			deal = frappe.get_doc("Deal", deal_name)
			deal.update_delivery_status()


def get_other_delivered_qty_for_item(deal_name, deal_item_name, exclude_delivery=None):
	"""Get total delivered qty for a specific Deal Item row."""
	conditions = ["sdi.soda = %s", "sdi.deal_item = %s"]
	values = [deal_name, deal_item_name]

	if exclude_delivery:
		conditions.append("sd.name != %s")
		values.append(exclude_delivery)

	result = frappe.db.sql("""
		SELECT COALESCE(SUM(sdi.deliver_qty), 0)
		FROM `tabDeal Delivery Item` sdi
		INNER JOIN `tabDeal Delivery` sd ON sd.name = sdi.parent
		WHERE {conditions}
	""".format(conditions=" AND ".join(conditions)), values)

	return flt(result[0][0]) if result else 0


@frappe.whitelist()
def get_pending_deal_items(customer, item=None, pack_size=None, exclude_delivery=None):
	"""FIFO: Get all pending Deal Item rows for a customer, oldest deal first."""
	item_conditions = ""
	values = [customer]

	if item:
		item_conditions += " AND di.item = %s"
		values.append(item)

	if pack_size:
		item_conditions += " AND di.pack_size = %s"
		values.append(pack_size)

	rows = frappe.db.sql("""
		SELECT
			d.name as deal_name,
			d.soda_date,
			d.customer,
			d.customer_name,
			d.price_list_area,
			di.name as deal_item_name,
			di.item,
			di.item_name,
			di.pack_size,
			di.pack_weight_kg,
			di.qty,
			di.delivered_qty,
			di.pending_qty,
			di.rate,
			di.item_status
		FROM `tabDeal Item` di
		INNER JOIN `tabDeal` d ON d.name = di.parent
		WHERE d.customer = %s
		  AND d.status IN ('Open', 'Confirmed', 'Partially Delivered')
		  AND di.item_status IN ('Open', 'Partially Delivered')
		  AND (di.qty - di.delivered_qty) > 0
		  {item_conditions}
		ORDER BY d.soda_date ASC, d.creation ASC, di.idx ASC
	""".format(item_conditions=item_conditions), values, as_dict=True)

	result = []
	for row in rows:
		other_delivered = get_other_delivered_qty_for_item(
			row.deal_name, row.deal_item_name, exclude_delivery)
		actual_pending = flt(row.qty) - flt(other_delivered)
		if actual_pending > 0:
			row['already_delivered'] = flt(other_delivered)
			row['pending_qty'] = actual_pending
			result.append(row)

	return result


@frappe.whitelist()
def allocate_fifo(customer, total_qty, item=None, pack_size=None, exclude_delivery=None):
	"""FIFO: Allocate delivery qty across pending Deal Items, oldest deal first."""
	pending = get_pending_deal_items(customer, item, pack_size, exclude_delivery)
	remaining = flt(total_qty)
	allocations = []

	for row in pending:
		if remaining <= 0:
			break

		allocate_qty = min(remaining, flt(row['pending_qty']))
		allocations.append({
			'soda': row['deal_name'],
			'deal_item': row['deal_item_name'],
			'customer': row['customer_name'],
			'item': row['item'],
			'pack_size': row['pack_size'],
			'soda_qty': row['qty'],
			'already_delivered': row['already_delivered'],
			'pending_qty': row['pending_qty'],
			'deliver_qty': allocate_qty,
			'rate': row['rate'],
			'amount': allocate_qty * flt(row['rate'])
		})
		remaining -= allocate_qty

	if remaining > 0:
		frappe.msgprint(
			"Warning: {0} packs could not be allocated. Insufficient pending Deal quantity.".format(remaining),
			indicator='orange'
		)

	return allocations
