# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class VehicleDispatch(Document):
	def before_save(self):
		self.validate_deliveries()
		self.calculate_totals()
		self.validate_capacity()
		self.set_status()

	def set_status(self):
		if self.docstatus == 0:
			self.status = "Loading"
		elif self.docstatus == 1:
			self.status = "Dispatched"
		elif self.docstatus == 2:
			self.status = "Cancelled"

	def validate_deliveries(self):
		seen = set()
		for row in self.deliveries:
			if not row.deal_delivery:
				frappe.throw("Row {0}: Deal Delivery is required.".format(row.idx))

			# No duplicates
			if row.deal_delivery in seen:
				frappe.throw("Row {0}: Deal Delivery {1} is added more than once.".format(
					row.idx, row.deal_delivery))
			seen.add(row.deal_delivery)

			dd = frappe.get_doc("Deal Delivery", row.deal_delivery)
			if dd.docstatus != 1:
				frappe.throw("Row {0}: Deal Delivery {1} is not submitted.".format(
					row.idx, row.deal_delivery))

			existing = get_existing_dispatch(row.deal_delivery, exclude=self.name)
			if existing:
				frappe.throw("Row {0}: Deal Delivery {1} is already in Vehicle Dispatch {2}.".format(
					row.idx, row.deal_delivery, existing))

	def calculate_totals(self):
		total_kg = 0
		total_packs = 0
		total_amount = 0
		customers = set()
		for row in self.deliveries:
			total_kg += flt(row.total_kg)
			total_packs += flt(row.total_packs)
			total_amount += flt(row.total_amount)
			if row.customer:
				customers.add(row.customer)

		self.total_loaded_kg = total_kg
		self.total_packs = total_packs
		self.total_amount = total_amount
		self.total_customers = len(customers)
		self.remaining_capacity_kg = flt(self.vehicle_capacity_kg) - total_kg
		if flt(self.vehicle_capacity_kg):
			self.capacity_utilization = (total_kg / flt(self.vehicle_capacity_kg)) * 100
		else:
			self.capacity_utilization = 0

	def validate_capacity(self):
		if flt(self.total_loaded_kg) > flt(self.vehicle_capacity_kg) + 1:
			frappe.msgprint(
				"Warning: Loaded {0:.2f} KG exceeds vehicle capacity {1:.2f} KG".format(
					self.total_loaded_kg, self.vehicle_capacity_kg),
				indicator='orange', alert=True)

	def on_submit(self):
		self.db_set("status", "Dispatched")

	def on_cancel(self):
		self.db_set("status", "Cancelled")


def get_existing_dispatch(deal_delivery, exclude=None):
	"""Check if a Deal Delivery is already in an active Vehicle Dispatch."""
	conditions = ["vdi.deal_delivery = %s", "vd.docstatus IN (0, 1)"]
	values = [deal_delivery]

	if exclude:
		conditions.append("vd.name != %s")
		values.append(exclude)

	result = frappe.db.sql("""
		SELECT vd.name
		FROM `tabVehicle Dispatch Item` vdi
		INNER JOIN `tabVehicle Dispatch` vd ON vd.name = vdi.parent
		WHERE {conditions}
		LIMIT 1
	""".format(conditions=" AND ".join(conditions)), values)

	return result[0][0] if result else None


@frappe.whitelist()
def get_undispatched_deliveries():
	"""Get all submitted Deal Deliveries not yet in any active Vehicle Dispatch."""
	result = frappe.db.sql("""
		SELECT dd.name, dd.customer, dd.customer_name, dd.delivery_date,
			dd.total_delivery_qty as total_packs, dd.total_delivery_kg as total_kg,
			dd.total_amount
		FROM `tabDeal Delivery` dd
		WHERE dd.docstatus = 1
		  AND dd.name NOT IN (
			  SELECT vdi.deal_delivery
			  FROM `tabVehicle Dispatch Item` vdi
			  INNER JOIN `tabVehicle Dispatch` vd ON vd.name = vdi.parent
			  WHERE vd.docstatus IN (0, 1)
		  )
		ORDER BY dd.delivery_date ASC, dd.creation ASC
	""", as_dict=True)
	return result
