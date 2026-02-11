# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class SodaDelivery(Document):
	def before_save(self):
		self.validate_items()
		self.calculate_totals()

	def validate_items(self):
		for row in self.items:
			soda = frappe.get_doc("Soda", row.soda)

			if soda.status == "Cancelled":
				frappe.throw("Soda {0} is cancelled. Cannot deliver against it.".format(row.soda))

			if soda.status == "Delivered":
				frappe.throw("Soda {0} is already fully delivered.".format(row.soda))

			other_delivered = get_other_delivered_qty(row.soda, self.name)
			available = flt(soda.qty) - flt(other_delivered)

			if flt(row.deliver_qty) > available:
				frappe.throw(
					"Deliver Qty ({0}) for Soda {1} exceeds available pending qty ({2})".format(
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
		self.update_soda_statuses()

	def on_trash(self):
		# Store affected sodas before deletion
		self._affected_sodas = set()
		for row in self.items:
			self._affected_sodas.add(row.soda)

	def after_delete(self):
		# Recalculate affected Sodas after this delivery is deleted
		for soda_name in getattr(self, '_affected_sodas', set()):
			try:
				soda = frappe.get_doc("Soda", soda_name)
				soda.update_delivery_status()
			except frappe.DoesNotExistError:
				pass

	def update_soda_statuses(self):
		affected_sodas = set()
		for row in self.items:
			affected_sodas.add(row.soda)

		for soda_name in affected_sodas:
			soda = frappe.get_doc("Soda", soda_name)
			soda.update_delivery_status()


def get_other_delivered_qty(soda_name, exclude_delivery=None):
	"""Get total delivered qty for a Soda, optionally excluding a specific delivery."""
	conditions = ["sdi.soda = %s"]
	values = [soda_name]

	if exclude_delivery:
		conditions.append("sd.name != %s")
		values.append(exclude_delivery)

	result = frappe.db.sql("""
		SELECT COALESCE(SUM(sdi.deliver_qty), 0)
		FROM `tabSoda Delivery Item` sdi
		INNER JOIN `tabSoda Delivery` sd ON sd.name = sdi.parent
		WHERE {conditions}
	""".format(conditions=" AND ".join(conditions)), values)

	return flt(result[0][0]) if result else 0


@frappe.whitelist()
def get_pending_sodas(customer, item, pack_size, exclude_delivery=None):
	"""FIFO: Get all pending Sodas for a customer+item+pack_size, oldest first."""
	sodas = frappe.db.sql("""
		SELECT
			name, soda_date, customer, customer_name, item, item_name,
			pack_size, qty, delivered_qty, pending_qty, rate, status
		FROM `tabSoda`
		WHERE customer = %s
		  AND item = %s
		  AND pack_size = %s
		  AND status IN ('Open', 'Confirmed', 'Partially Delivered')
		  AND (qty - delivered_qty) > 0
		ORDER BY soda_date ASC, creation ASC
	""", (customer, item, pack_size), as_dict=True)

	result = []
	for soda in sodas:
		other_delivered = get_other_delivered_qty(soda.name, exclude_delivery)
		actual_pending = flt(soda.qty) - flt(other_delivered)
		if actual_pending > 0:
			soda['already_delivered'] = flt(other_delivered)
			soda['pending_qty'] = actual_pending
			result.append(soda)

	return result


@frappe.whitelist()
def allocate_fifo(customer, item, pack_size, total_qty, exclude_delivery=None):
	"""FIFO: Allocate delivery qty across pending Sodas, oldest first."""
	pending_sodas = get_pending_sodas(customer, item, pack_size, exclude_delivery)
	remaining = flt(total_qty)
	allocations = []

	for soda in pending_sodas:
		if remaining <= 0:
			break

		allocate_qty = min(remaining, flt(soda['pending_qty']))
		allocations.append({
			'soda': soda['name'],
			'customer': soda['customer_name'],
			'item': soda['item'],
			'pack_size': soda['pack_size'],
			'soda_qty': soda['qty'],
			'already_delivered': soda['already_delivered'],
			'pending_qty': soda['pending_qty'],
			'deliver_qty': allocate_qty,
			'rate': soda['rate'],
			'amount': allocate_qty * flt(soda['rate'])
		})
		remaining -= allocate_qty

	if remaining > 0:
		frappe.msgprint(
			"Warning: {0} packs could not be allocated. Insufficient pending Soda quantity.".format(remaining),
			indicator='orange'
		)

	return allocations
