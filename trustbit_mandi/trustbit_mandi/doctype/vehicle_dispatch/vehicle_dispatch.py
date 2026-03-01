# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

from trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery import (
	get_other_delivered_kg_for_item,
)


class VehicleDispatch(Document):
	def before_save(self):
		self.calculate_item_kg()
		self.calculate_totals()
		self.calculate_customer_payment_totals()
		self.calculate_freight_totals()
		self.validate_capacity()
		self.set_status()

	def calculate_item_kg(self):
		for row in self.load_items:
			row.kg = flt(row.qty) * flt(row.pack_weight_kg)
			row.amount = flt(row.qty) * flt(row.rate)

	def calculate_totals(self):
		total_kg = 0
		total_packs = 0
		total_amount = 0
		customers = set()
		for row in self.load_items:
			total_kg += flt(row.kg)
			total_packs += flt(row.qty)
			total_amount += flt(row.amount)
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

	def calculate_customer_payment_totals(self):
		customer_amounts = {}
		for row in self.load_items:
			if row.customer:
				customer_amounts.setdefault(row.customer, 0)
				customer_amounts[row.customer] += flt(row.amount)

		for row in self.customer_payments:
			row.invoice_amount = flt(customer_amounts.get(row.customer, 0))
			row.balance_amount = flt(row.invoice_amount) - flt(row.paying_amount)

	def calculate_freight_totals(self):
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

	def set_status(self):
		if self.docstatus == 0:
			self.status = "Loading"
		elif self.docstatus == 1:
			self.status = "Dispatched"
		elif self.docstatus == 2:
			self.status = "Cancelled"

	def on_submit(self):
		if not self.load_items:
			frappe.throw("Cannot dispatch without any items loaded.")

		# Count steps for progress bar
		customer_deal_groups = self._group_items_by_customer_deal()
		customers = list(set(row.customer for row in self.load_items if row.customer))
		paying_customers = [row for row in self.customer_payments if flt(row.paying_amount) > 0]

		total_steps = len(customer_deal_groups) + len(customers) + len(paying_customers)
		if total_steps == 0:
			total_steps = 1
		step = 0

		# Step 1: Create Deal Deliveries (grouped by customer + deal)
		for key, items in customer_deal_groups.items():
			customer, deal = key
			customer_name = items[0].get("customer_name", "")
			step += 1
			frappe.publish_progress(
				step * 100 / total_steps,
				title="Dispatching Vehicle...",
				description="Creating delivery for {0}...".format(customer_name or customer))

			dd = self._create_deal_delivery(customer, deal, items)
			# Set back-reference on load_item rows
			for item in items:
				frappe.db.set_value(
					"Vehicle Dispatch Load Item", item["row_name"],
					"deal_delivery", dd.name, update_modified=False)

		# Step 2: Create Sales Invoices (per customer)
		customer_si_map = {}
		for customer in customers:
			step += 1
			customer_name = frappe.get_cached_value("Customer", customer, "customer_name") or customer
			frappe.publish_progress(
				step * 100 / total_steps,
				title="Dispatching Vehicle...",
				description="Creating invoice for {0}...".format(customer_name))

			si = self._create_sales_invoice(customer)
			customer_si_map[customer] = si.name

		# Set SI reference on customer_payments
		for row in self.customer_payments:
			if row.customer in customer_si_map:
				frappe.db.set_value(
					"Vehicle Dispatch Customer Payment", row.name,
					"sales_invoice", customer_si_map[row.customer], update_modified=False)

		# Step 3: Create Payment Entries (per customer, if paying_amount > 0)
		for row in paying_customers:
			step += 1
			customer_name = row.customer_name or row.customer
			frappe.publish_progress(
				step * 100 / total_steps,
				title="Dispatching Vehicle...",
				description="Recording payment for {0}...".format(customer_name))

			si_name = customer_si_map.get(row.customer)
			if si_name:
				pe = self._create_payment_entry(row, si_name)
				if pe:
					frappe.db.set_value(
						"Vehicle Dispatch Customer Payment", row.name,
						"payment_entry", pe.name, update_modified=False)

		frappe.publish_progress(100, title="Vehicle Dispatched!",
			description="All documents created successfully.")
		self.db_set("status", "Dispatched")

	def on_cancel(self):
		total_steps = 3
		step = 0

		# Step 1: Cancel Payment Entries
		step += 1
		frappe.publish_progress(
			step * 100 / total_steps,
			title="Cancelling Dispatch...",
			description="Cancelling payment entries...")
		self._cancel_payment_entries()

		# Step 2: Cancel Sales Invoices
		step += 1
		frappe.publish_progress(
			step * 100 / total_steps,
			title="Cancelling Dispatch...",
			description="Cancelling sales invoices...")
		self._cancel_sales_invoices()

		# Step 3: Cancel Deal Deliveries (DD on_cancel handles MSE + Deal rollback)
		step += 1
		frappe.publish_progress(
			step * 100 / total_steps,
			title="Cancelling Dispatch...",
			description="Cancelling deliveries and restoring stock...")
		self._cancel_deal_deliveries()

		frappe.publish_progress(100, title="Dispatch Cancelled",
			description="All documents cancelled.")
		self.db_set("status", "Cancelled")

	# ── Helper: Group items ──

	def _group_items_by_customer_deal(self):
		groups = {}
		for row in self.load_items:
			if not row.soda:
				continue
			key = (row.customer, row.soda)
			if key not in groups:
				groups[key] = []
			groups[key].append({
				"row_name": row.name,
				"customer_name": row.customer_name,
				"soda": row.soda,
				"deal_item": row.deal_item,
				"item": row.item,
				"pack_size": row.pack_size,
				"pack_weight_kg": flt(row.pack_weight_kg),
				"qty": flt(row.qty),
				"bag_cost": flt(row.bag_cost),
				"rate": flt(row.rate),
				"amount": flt(row.amount),
				"price_per_kg": flt(row.price_per_kg),
			})
		return groups

	# ── Helper: Create Deal Delivery ──

	def _create_deal_delivery(self, customer, deal, items):
		dd = frappe.new_doc("Deal Delivery")
		dd.customer = customer
		dd.delivery_date = self.dispatch_date
		dd.is_auto_created = 1
		dd.vehicle_dispatch = self.name

		for item in items:
			dd.append("items", {
				"soda": item["soda"],
				"deal_item": item.get("deal_item") or "",
				"item": item["item"],
				"pack_size": item["pack_size"],
				"pack_weight_kg": flt(item["pack_weight_kg"]),
				"deliver_qty": flt(item["qty"]),
				"bag_cost": flt(item.get("bag_cost", 0)),
				"rate": flt(item["rate"]),
				"amount": flt(item["qty"]) * flt(item["rate"]),
			})

		dd.save(ignore_permissions=True)
		dd.submit()
		return dd

	# ── Helper: Create Sales Invoice ──

	def _create_sales_invoice(self, customer):
		customer_items = [row for row in self.load_items if row.customer == customer]
		if not customer_items:
			frappe.throw("No items found for customer {0}".format(customer))

		company = "Trustbit Mandi"

		si = frappe.new_doc("Sales Invoice")
		si.customer = customer
		si.posting_date = self.dispatch_date
		si.due_date = self.dispatch_date
		si.company = company
		si.update_stock = 0
		si.set_posting_time = 1

		income_account = frappe.get_cached_value("Company", company, "default_income_account")
		cost_center = frappe.get_cached_value("Company", company, "cost_center")

		for row in customer_items:
			qty_kg = flt(row.qty) * flt(row.pack_weight_kg)
			amount = flt(row.amount)
			rate_per_kg = amount / qty_kg if qty_kg else 0

			si_item = {
				"item_code": row.item,
				"qty": flt(qty_kg, 3),
				"uom": "Kg",
				"rate": flt(rate_per_kg, 4),
				"amount": amount,
				"description": "{0} - {1} x {2} packs".format(
					row.item, row.pack_size, int(row.qty)),
			}
			if income_account:
				si_item["income_account"] = income_account
			if cost_center:
				si_item["cost_center"] = cost_center

			si.append("items", si_item)

		si.insert(ignore_permissions=True)
		si.submit()

		frappe.msgprint(
			"Sales Invoice {0} created for {1}.".format(
				'<a href="/app/sales-invoice/{0}">{0}</a>'.format(si.name),
				customer),
			indicator="green", alert=True)
		return si

	# ── Helper: Create Payment Entry ──

	def _create_payment_entry(self, payment_row, si_name):
		try:
			from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

			pe = get_payment_entry("Sales Invoice", si_name)
			pe.paid_amount = flt(payment_row.paying_amount)
			pe.received_amount = flt(payment_row.paying_amount)
			pe.mode_of_payment = payment_row.payment_mode or "Cash"
			pe.reference_no = payment_row.reference or self.name
			pe.reference_date = self.dispatch_date

			if pe.references:
				pe.references[0].allocated_amount = flt(payment_row.paying_amount)

			pe.insert(ignore_permissions=True)
			pe.submit()

			frappe.msgprint(
				"Payment Entry {0} created for {1}.".format(
					'<a href="/app/payment-entry/{0}">{0}</a>'.format(pe.name),
					payment_row.customer_name or payment_row.customer),
				indicator="green", alert=True)
			return pe
		except Exception as e:
			frappe.log_error(
				title="Payment Entry creation failed for {0}".format(payment_row.customer),
				message=str(e))
			frappe.msgprint(
				"Warning: Could not create Payment Entry for {0}. Error: {1}".format(
					payment_row.customer_name or payment_row.customer, str(e)),
				indicator="orange", alert=True)
			return None

	# ── Cancel helpers ──

	def _cancel_payment_entries(self):
		for row in self.customer_payments:
			pe_name = frappe.db.get_value(
				"Vehicle Dispatch Customer Payment",
				row.name, "payment_entry")
			if pe_name:
				try:
					pe = frappe.get_doc("Payment Entry", pe_name)
					if pe.docstatus == 1:
						pe.cancel()
						frappe.msgprint(
							"Payment Entry {0} cancelled.".format(pe_name),
							indicator="orange", alert=True)
				except Exception as e:
					frappe.log_error(
						title="Failed to cancel PE {0}".format(pe_name),
						message=str(e))
					frappe.msgprint(
						"Warning: Could not cancel Payment Entry {0}. Error: {1}".format(
							pe_name, str(e)),
						indicator="red", alert=True)

	def _cancel_sales_invoices(self):
		si_names = set()
		for row in self.customer_payments:
			si_name = frappe.db.get_value(
				"Vehicle Dispatch Customer Payment",
				row.name, "sales_invoice")
			if si_name:
				si_names.add(si_name)

		for si_name in si_names:
			try:
				si = frappe.get_doc("Sales Invoice", si_name)
				if si.docstatus == 1:
					si.cancel()
					frappe.msgprint(
						"Sales Invoice {0} cancelled.".format(si_name),
						indicator="orange", alert=True)
			except Exception as e:
				frappe.log_error(
					title="Failed to cancel SI {0}".format(si_name),
					message=str(e))
				frappe.msgprint(
					"Warning: Could not cancel Sales Invoice {0}. Error: {1}".format(
						si_name, str(e)),
					indicator="red", alert=True)

	def _cancel_deal_deliveries(self):
		dd_names = set()
		for row in self.load_items:
			dd_name = frappe.db.get_value(
				"Vehicle Dispatch Load Item",
				row.name, "deal_delivery")
			if dd_name:
				dd_names.add(dd_name)

		auto_dds = frappe.get_all(
			"Deal Delivery",
			filters={
				"vehicle_dispatch": self.name,
				"is_auto_created": 1,
				"docstatus": 1
			},
			pluck="name"
		)
		dd_names.update(auto_dds)

		for dd_name in dd_names:
			try:
				dd = frappe.get_doc("Deal Delivery", dd_name)
				if dd.docstatus == 1:
					dd.cancel()
					frappe.msgprint(
						"Delivery {0} cancelled.".format(dd_name),
						indicator="orange", alert=True)
			except Exception as e:
				frappe.log_error(
					title="Failed to cancel DD {0}".format(dd_name),
					message=str(e))
				frappe.msgprint(
					"Warning: Could not cancel Delivery {0}. Error: {1}".format(
						dd_name, str(e)),
					indicator="red", alert=True)


# ── Whitelisted APIs ──

@frappe.whitelist()
def get_pending_items_for_dispatch(price_list_area=None, customer=None):
	"""Get pending Deal Items for VD dialog, filterable by area and/or customer."""
	if not price_list_area and not customer:
		frappe.throw("Please select an Area or Customer.")

	conditions = [
		"d.status IN ('Open', 'Confirmed', 'Partially Delivered')",
		"di.item_status IN ('Open', 'Partially Delivered')"
	]
	values = []

	if customer:
		conditions.append("d.customer = %s")
		values.append(customer)

	if price_list_area:
		conditions.append("d.price_list_area = %s")
		values.append(price_list_area)

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
			di.rate,
			di.price_per_kg,
			di.base_price_50kg,
			di.bag_cost
		FROM `tabDeal Item` di
		INNER JOIN `tabDeal` d ON d.name = di.parent
		WHERE {conditions}
		ORDER BY d.customer ASC, d.soda_date ASC, d.creation ASC, di.idx ASC
	""".format(conditions=" AND ".join(conditions)), values, as_dict=True)

	result = []
	for row in rows:
		booked_kg = flt(row.qty) * flt(row.pack_weight_kg)
		other_delivered_kg = get_other_delivered_kg_for_item(
			row.deal_name, row.deal_item_name)
		pending_kg = booked_kg - flt(other_delivered_kg)

		if pending_kg > 0.1:
			row['booked_kg'] = booked_kg
			row['delivered_kg'] = flt(other_delivered_kg)
			row['pending_kg'] = pending_kg
			if flt(row.pack_weight_kg) > 0:
				row['pending_packs'] = pending_kg / flt(row.pack_weight_kg)
			else:
				row['pending_packs'] = 0
			result.append(row)

	return result
