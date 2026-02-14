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

		for row in self.items:
			if flt(row.delivered_qty) > flt(row.qty):
				frappe.throw(
					"Row {0}: Delivered Qty ({1}) cannot exceed Qty ({2}) for item {3}".format(
						row.idx, row.delivered_qty, row.qty, row.item
					)
				)

	def calculate_items(self):
		"""Calculate amount, pending_qty and item_status for each item row."""
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
			row.pending_qty = flt(row.qty) - flt(row.delivered_qty)
			self._update_item_status(row)

	def _update_item_status(self, row):
		delivered = flt(row.delivered_qty)
		total = flt(row.qty)

		if delivered <= 0:
			row.item_status = "Open"
		elif delivered >= total:
			row.item_status = "Delivered"
		else:
			row.item_status = "Partially Delivered"

	def calculate_totals(self):
		self.total_qty = sum(flt(row.qty) for row in self.items)
		self.total_amount = sum(flt(row.amount) for row in self.items)

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
		"""Called by Deal Delivery to recalculate delivered_qty for ALL item rows."""
		for row in self.items:
			total_delivered = frappe.db.sql("""
				SELECT COALESCE(SUM(sdi.deliver_qty), 0)
				FROM `tabDeal Delivery Item` sdi
				INNER JOIN `tabDeal Delivery` sd ON sd.name = sdi.parent
				WHERE sdi.soda = %s AND sdi.deal_item = %s
			""", (self.name, row.name))[0][0]

			row.delivered_qty = flt(total_delivered)
			row.pending_qty = flt(row.qty) - flt(row.delivered_qty)
			self._update_item_status(row)

		self.calculate_totals()
		self.auto_update_status()
		self.save(ignore_permissions=True)
