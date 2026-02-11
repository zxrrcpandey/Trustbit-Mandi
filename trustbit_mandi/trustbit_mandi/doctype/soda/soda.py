# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


class Soda(Document):
	def before_save(self):
		self.calculate_amount()
		self.update_pending_qty()
		self.auto_update_status()

	def validate(self):
		if flt(self.delivered_qty) > flt(self.qty):
			frappe.throw("Delivered Qty ({0}) cannot exceed Qty ({1})".format(
				self.delivered_qty, self.qty
			))

	def calculate_amount(self):
		self.amount = flt(self.qty) * flt(self.rate)

	def update_pending_qty(self):
		self.pending_qty = flt(self.qty) - flt(self.delivered_qty)

	def auto_update_status(self):
		"""Auto-update status based on delivery. Never override Cancelled."""
		if self.status == "Cancelled":
			return

		delivered = flt(self.delivered_qty)
		total = flt(self.qty)

		if delivered <= 0:
			if self.status not in ("Open", "Confirmed"):
				self.status = "Open"
		elif delivered >= total:
			self.status = "Delivered"
		else:
			self.status = "Partially Delivered"

	def update_delivery_status(self):
		"""Called by Soda Delivery to recalculate delivered_qty from all deliveries."""
		total_delivered = frappe.db.sql("""
			SELECT COALESCE(SUM(sdi.deliver_qty), 0)
			FROM `tabSoda Delivery Item` sdi
			INNER JOIN `tabSoda Delivery` sd ON sd.name = sdi.parent
			WHERE sdi.soda = %s
		""", self.name)[0][0]

		self.delivered_qty = flt(total_delivered)
		self.pending_qty = flt(self.qty) - flt(self.delivered_qty)
		self.auto_update_status()
		self.save(ignore_permissions=True)
