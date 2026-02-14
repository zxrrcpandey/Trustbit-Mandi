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

			if deal.status == "Delivered":
				frappe.throw("Deal {0} is already fully delivered.".format(row.soda))

			other_delivered = get_other_delivered_qty(row.soda, self.name)
			available = flt(deal.qty) - flt(other_delivered)

			if flt(row.deliver_qty) > available:
				frappe.throw(
					"Deliver Qty ({0}) for Deal {1} exceeds available pending qty ({2})".format(
						row.deliver_qty, row.soda, available
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
		# Store affected deals before deletion
		self._affected_deals = set()
		for row in self.items:
			self._affected_deals.add(row.soda)

	def after_delete(self):
		# Recalculate affected Deals after this delivery is deleted
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


def get_other_delivered_qty(deal_name, exclude_delivery=None):
	"""Get total delivered qty for a Deal, optionally excluding a specific delivery."""
	conditions = ["sdi.soda = %s"]
	values = [deal_name]

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
def get_pending_deals(customer, item, pack_size, exclude_delivery=None):
	"""FIFO: Get all pending Deals for a customer+item+pack_size, oldest first."""
	deals = frappe.db.sql("""
		SELECT
			name, soda_date, customer, customer_name, item, item_name,
			pack_size, qty, delivered_qty, pending_qty, rate, status
		FROM `tabDeal`
		WHERE customer = %s
		  AND item = %s
		  AND pack_size = %s
		  AND status IN ('Open', 'Confirmed', 'Partially Delivered')
		  AND (qty - delivered_qty) > 0
		ORDER BY soda_date ASC, creation ASC
	""", (customer, item, pack_size), as_dict=True)

	result = []
	for deal in deals:
		other_delivered = get_other_delivered_qty(deal.name, exclude_delivery)
		actual_pending = flt(deal.qty) - flt(other_delivered)
		if actual_pending > 0:
			deal['already_delivered'] = flt(other_delivered)
			deal['pending_qty'] = actual_pending
			result.append(deal)

	return result


@frappe.whitelist()
def allocate_fifo(customer, item, pack_size, total_qty, exclude_delivery=None):
	"""FIFO: Allocate delivery qty across pending Deals, oldest first."""
	pending_deals = get_pending_deals(customer, item, pack_size, exclude_delivery)
	remaining = flt(total_qty)
	allocations = []

	for deal in pending_deals:
		if remaining <= 0:
			break

		allocate_qty = min(remaining, flt(deal['pending_qty']))
		allocations.append({
			'soda': deal['name'],
			'customer': deal['customer_name'],
			'item': deal['item'],
			'pack_size': deal['pack_size'],
			'soda_qty': deal['qty'],
			'already_delivered': deal['already_delivered'],
			'pending_qty': deal['pending_qty'],
			'deliver_qty': allocate_qty,
			'rate': deal['rate'],
			'amount': allocate_qty * flt(deal['rate'])
		})
		remaining -= allocate_qty

	if remaining > 0:
		frappe.msgprint(
			"Warning: {0} packs could not be allocated. Insufficient pending Deal quantity.".format(remaining),
			indicator='orange'
		)

	return allocations
