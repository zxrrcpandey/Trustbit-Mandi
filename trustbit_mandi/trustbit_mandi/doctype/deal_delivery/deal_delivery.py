# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class DealDelivery(Document):
	def before_save(self):
		self.set_extra_flag()
		self.validate_items()
		self.calculate_totals()

	def set_extra_flag(self):
		"""Auto-set is_extra when soda (Deal) is not set."""
		for row in self.items:
			row.is_extra = 1 if not row.soda else 0

	def validate_items(self):
		for row in self.items:
			if not row.deliver_qty or flt(row.deliver_qty) <= 0:
				frappe.throw("Row {0}: Deliver Qty must be greater than 0.".format(row.idx))

			# Skip deal validation for adhoc/extra items
			if not row.soda:
				if not row.item:
					frappe.throw("Row {0}: Item is required.".format(row.idx))
				if not row.pack_size:
					frappe.throw("Row {0}: Pack Size is required.".format(row.idx))
				continue

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

			# Validate in KG (allows different pack sizes)
			booked_kg = flt(deal_item_row.qty) * flt(deal_item_row.pack_weight_kg)
			other_delivered_kg = get_other_delivered_kg_for_item(
				row.soda, row.deal_item, self.name)
			available_kg = booked_kg - flt(other_delivered_kg)
			delivering_kg = flt(row.deliver_qty) * flt(row.pack_weight_kg)

			if delivering_kg > available_kg + 1:
				frappe.throw(
					"Row {0}: Delivering {1:.2f} KG for Deal {2} Item {3} exceeds available {4:.2f} KG".format(
						row.idx, delivering_kg, row.soda, deal_item_row.item, available_kg
					)
				)

	def calculate_totals(self):
		total_qty = 0
		total_kg = 0
		total_amount = 0
		for row in self.items:
			row.amount = flt(row.deliver_qty) * flt(row.rate)
			total_qty += flt(row.deliver_qty)
			total_kg += flt(row.deliver_qty) * flt(row.pack_weight_kg)
			total_amount += flt(row.amount)

		self.total_delivery_qty = total_qty
		self.total_delivery_kg = total_kg
		self.total_amount = total_amount

	def on_submit(self):
		"""Update Deal statuses only when delivery is submitted."""
		self.update_deal_statuses()

	def on_cancel(self):
		"""Recalculate Deal statuses when delivery is cancelled."""
		self.update_deal_statuses()

	def on_trash(self):
		"""Track affected deals before deletion (only drafts can be deleted)."""
		self._affected_deals = set()
		for row in self.items:
			if row.soda:
				self._affected_deals.add(row.soda)

	def after_delete(self):
		"""Recalculate affected deals after deletion."""
		for deal_name in getattr(self, '_affected_deals', set()):
			try:
				deal = frappe.get_doc("Deal", deal_name)
				deal.update_delivery_status()
			except frappe.DoesNotExistError:
				pass

	def update_deal_statuses(self):
		affected_deals = set()
		for row in self.items:
			if row.soda:
				affected_deals.add(row.soda)

		for deal_name in affected_deals:
			deal = frappe.get_doc("Deal", deal_name)
			deal.update_delivery_status()


def get_other_delivered_qty_for_item(deal_name, deal_item_name, exclude_delivery=None):
	"""Get total delivered qty (packs) for a specific Deal Item row.
	Only counts submitted deliveries (docstatus=1)."""
	conditions = ["sdi.soda = %s", "sdi.deal_item = %s", "sd.docstatus = 1"]
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


def get_other_delivered_kg_for_item(deal_name, deal_item_name, exclude_delivery=None):
	"""Get total delivered KG for a specific Deal Item row.
	Only counts submitted deliveries (docstatus=1)."""
	conditions = ["sdi.soda = %s", "sdi.deal_item = %s", "sd.docstatus = 1"]
	values = [deal_name, deal_item_name]

	if exclude_delivery:
		conditions.append("sd.name != %s")
		values.append(exclude_delivery)

	result = frappe.db.sql("""
		SELECT COALESCE(SUM(sdi.deliver_qty * sdi.pack_weight_kg), 0)
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

	# When editing an existing delivery (exclude_delivery set), include
	# "Delivered" deals/items too — excluding the current delivery may
	# make them pending again.
	if exclude_delivery:
		deal_statuses = "('Open', 'Confirmed', 'Partially Delivered', 'Delivered')"
		item_statuses = "('Open', 'Partially Delivered', 'Delivered')"
	else:
		deal_statuses = "('Open', 'Confirmed', 'Partially Delivered')"
		item_statuses = "('Open', 'Partially Delivered')"

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
			di.price_per_kg,
			di.base_price_50kg,
			di.item_status
		FROM `tabDeal Item` di
		INNER JOIN `tabDeal` d ON d.name = di.parent
		WHERE d.customer = %s
		  AND d.status IN {deal_statuses}
		  AND di.item_status IN {item_statuses}
		  {item_conditions}
		ORDER BY d.soda_date ASC, d.creation ASC, di.idx ASC
	""".format(
		deal_statuses=deal_statuses,
		item_statuses=item_statuses,
		item_conditions=item_conditions
	), values, as_dict=True)

	result = []
	for row in rows:
		booked_kg = flt(row.qty) * flt(row.pack_weight_kg)
		other_delivered_kg = get_other_delivered_kg_for_item(
			row.deal_name, row.deal_item_name, exclude_delivery)
		pending_kg = booked_kg - flt(other_delivered_kg)

		other_delivered_packs = get_other_delivered_qty_for_item(
			row.deal_name, row.deal_item_name, exclude_delivery)
		actual_pending_packs = flt(row.qty) - flt(other_delivered_packs)

		if pending_kg > 0.1:
			row['already_delivered'] = flt(other_delivered_packs)
			row['pending_qty'] = actual_pending_packs
			row['booked_kg'] = booked_kg
			row['delivered_kg'] = flt(other_delivered_kg)
			row['pending_kg'] = pending_kg
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


@frappe.whitelist()
def get_pack_sizes():
	"""Get all active pack sizes for dropdown."""
	return frappe.db.sql("""
		SELECT name as pack_size, weight_kg
		FROM `tabDeal Pack Size`
		WHERE is_active = 1
		ORDER BY weight_kg ASC
	""", as_dict=True)


@frappe.whitelist()
def get_bag_cost_map():
	"""Get bag costs keyed by item:pack_size."""
	rows = frappe.db.sql("""
		SELECT item, pack_size, bag_cost
		FROM `tabPackage Bag Master`
		WHERE is_active = 1
	""", as_dict=True)
	result = {}
	for r in rows:
		result[r.item + ":" + r.pack_size] = flt(r.bag_cost)
	return result
