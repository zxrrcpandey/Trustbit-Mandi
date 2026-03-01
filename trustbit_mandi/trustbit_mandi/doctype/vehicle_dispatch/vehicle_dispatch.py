# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class VehicleDispatch(Document):
	def before_save(self):
		self.validate_deliveries()
		self.calculate_totals()
		self.calculate_payment_totals()
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

			# No duplicates within same VD
			if row.deal_delivery in seen:
				frappe.throw("Row {0}: Deal Delivery {1} is added more than once.".format(
					row.idx, row.deal_delivery))
			seen.add(row.deal_delivery)

			dd = frappe.get_doc("Deal Delivery", row.deal_delivery)
			if dd.docstatus != 1:
				frappe.throw("Row {0}: Deal Delivery {1} is not submitted.".format(
					row.idx, row.deal_delivery))

			dd_total_kg = flt(dd.total_delivery_kg)
			loaded = flt(row.loaded_kg)

			if loaded <= 0:
				frappe.throw("Row {0}: Loaded KG must be greater than 0.".format(row.idx))

			if loaded > dd_total_kg + 0.1:
				frappe.throw("Row {0}: Loaded KG ({1}) exceeds Deal Delivery total ({2} KG).".format(
					row.idx, loaded, dd_total_kg))

			# Check total loaded across all other VDs
			already_loaded = get_already_loaded_kg(row.deal_delivery, exclude=self.name)
			if already_loaded + loaded > dd_total_kg + 0.1:
				frappe.throw(
					"Row {0}: Deal Delivery {1} has {2} KG total, "
					"{3} KG already loaded in other dispatches. "
					"Cannot load {4} KG more.".format(
						row.idx, row.deal_delivery, dd_total_kg,
						already_loaded, loaded))

			# Calculate loaded_amount proportionally
			if dd_total_kg > 0:
				row.loaded_amount = flt(dd.total_amount) * (loaded / dd_total_kg)
			else:
				row.loaded_amount = 0

	def calculate_totals(self):
		total_kg = 0
		total_packs = 0
		total_amount = 0
		customers = set()
		for row in self.deliveries:
			total_kg += flt(row.loaded_kg)
			total_packs += flt(row.total_packs)
			total_amount += flt(row.loaded_amount)
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

	def calculate_payment_totals(self):
		total_paid = 0
		for row in self.payments:
			total_paid += flt(row.amount)
		self.total_paid = total_paid
		self.balance_amount = flt(self.freight_amount) - total_paid

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


def get_already_loaded_kg(deal_delivery, exclude=None):
	"""Get total loaded_kg for a Deal Delivery across all active Vehicle Dispatches."""
	conditions = ["vdi.deal_delivery = %s", "vd.docstatus IN (0, 1)"]
	values = [deal_delivery]

	if exclude:
		conditions.append("vd.name != %s")
		values.append(exclude)

	result = frappe.db.sql("""
		SELECT COALESCE(SUM(vdi.loaded_kg), 0) as total_loaded
		FROM `tabVehicle Dispatch Item` vdi
		INNER JOIN `tabVehicle Dispatch` vd ON vd.name = vdi.parent
		WHERE {conditions}
	""".format(conditions=" AND ".join(conditions)), values)

	return flt(result[0][0]) if result else 0


@frappe.whitelist()
def get_available_deliveries(exclude_dispatch=None):
	"""Get submitted Deal Deliveries that have remaining KG available for loading."""
	result = frappe.db.sql("""
		SELECT dd.name, dd.customer, dd.customer_name, dd.delivery_date,
			dd.total_delivery_qty as total_packs, dd.total_delivery_kg as total_kg,
			dd.total_amount,
			dd.total_delivery_kg - COALESCE(
				(SELECT SUM(vdi.loaded_kg)
				 FROM `tabVehicle Dispatch Item` vdi
				 INNER JOIN `tabVehicle Dispatch` vd ON vd.name = vdi.parent
				 WHERE vdi.deal_delivery = dd.name
				   AND vd.docstatus IN (0, 1)
				   {exclude_condition}
				), 0
			) as remaining_kg
		FROM `tabDeal Delivery` dd
		WHERE dd.docstatus = 1
		HAVING remaining_kg > 0.1
		ORDER BY dd.delivery_date ASC, dd.creation ASC
	""".format(
		exclude_condition="AND vd.name != %s" if exclude_dispatch else ""
	), [exclude_dispatch] if exclude_dispatch else [], as_dict=True)
	return result
