# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


class HamaliRateMaster(Document):
	def before_save(self):
		self.add_to_history()

	def add_to_history(self):
		"""Add current rate to history if it's different from existing entries"""
		upto_60 = flt(self.upto_60_kg, 2)
		more_60 = flt(self.more_than_60_kg, 2)

		# Don't add if both rates are 0
		if upto_60 == 0 and more_60 == 0:
			return

		# Check if this exact rate combination already exists
		for row in self.rate_history:
			if flt(row.upto_60_kg, 2) == upto_60 and flt(row.more_than_60_kg, 2) == more_60:
				return  # Rate already exists, don't add duplicate

		# Add new rate to history
		self.append("rate_history", {
			"effective_date": self.effective_date or now_datetime(),
			"upto_60_kg": upto_60,
			"more_than_60_kg": more_60
		})

		frappe.msgprint(
			f"Rate added to history: ₹{upto_60} (≤60 KG), ₹{more_60} (>60 KG)",
			alert=True,
			indicator="green"
		)
