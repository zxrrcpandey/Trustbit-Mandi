# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class Deal(Document):
	def before_save(self):
		self.calculate_items()
		self.calculate_totals()
		self.auto_update_status()

	def validate(self):
		if not self.items:
			frappe.throw("At least one item is required in the Deal.")

	def calculate_items(self):
		"""Calculate amount, pending_qty, quintal and item_status for each item row."""
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
			row.pending_qty = flt(row.qty) - flt(row.delivered_qty)
			booked_quintal = (flt(row.qty) * flt(row.pack_weight_kg)) / 100
			row.pending_quintal = booked_quintal - flt(row.delivered_quintal)
			self._update_item_status(row)

	def _update_item_status(self, row):
		"""Determine item status based on quintal comparison."""
		booked_quintal = (flt(row.qty) * flt(row.pack_weight_kg)) / 100
		delivered_quintal = flt(row.delivered_quintal)

		if delivered_quintal <= 0:
			row.item_status = "Open"
		elif delivered_quintal >= booked_quintal - 0.001:
			row.item_status = "Delivered"
		else:
			row.item_status = "Partially Delivered"

	def calculate_totals(self):
		self.total_qty = sum(flt(row.qty) for row in self.items)
		self.total_amount = sum(flt(row.amount) for row in self.items)
		self.total_quintal = sum(
			(flt(row.qty) * flt(row.pack_weight_kg)) / 100 for row in self.items
		)
		self.total_delivered_quintal = sum(
			flt(row.delivered_quintal) for row in self.items
		)
		self.total_pending_quintal = sum(
			flt(row.pending_quintal) for row in self.items
		)

	def auto_update_status(self):
		"""Auto-update parent status based on all item statuses. Never override Cancelled."""
		if self.status == "Cancelled":
			return

		if not self.items:
			return

		statuses = [row.item_status for row in self.items]

		if all(s == "Delivered" for s in statuses):
			self.status = "Delivered"
		elif any(s in ("Partially Delivered", "Delivered") for s in statuses):
			self.status = "Partially Delivered"
		else:
			# All Open - keep Open or Confirmed as-is
			if self.status not in ("Open", "Confirmed"):
				self.status = "Open"

	def update_delivery_status(self):
		"""Called by Deal Delivery to recalculate delivered qty/quintal for ALL item rows."""
		for row in self.items:
			result = frappe.db.sql("""
				SELECT
					COALESCE(SUM(sdi.deliver_qty), 0),
					COALESCE(SUM(sdi.deliver_qty * sdi.pack_weight_kg / 100), 0)
				FROM `tabDeal Delivery Item` sdi
				INNER JOIN `tabDeal Delivery` sd ON sd.name = sdi.parent
				WHERE sdi.soda = %s AND sdi.deal_item = %s
			""", (self.name, row.name))[0]

			row.delivered_qty = flt(result[0])
			row.delivered_quintal = flt(result[1])
			row.pending_qty = flt(row.qty) - flt(row.delivered_qty)
			booked_quintal = (flt(row.qty) * flt(row.pack_weight_kg)) / 100
			row.pending_quintal = booked_quintal - flt(row.delivered_quintal)
			self._update_item_status(row)

		self.calculate_totals()
		self.auto_update_status()
		self.save(ignore_permissions=True)
