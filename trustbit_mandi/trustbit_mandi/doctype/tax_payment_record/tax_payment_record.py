# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class TaxPaymentRecord(Document):
	def before_save(self):
		"""Auto-fill bank details from Mandi Bank Master"""
		self.fetch_bank_details()

	def fetch_bank_details(self):
		"""Fetch bank details when bank_account is selected"""
		if self.bank_account:
			try:
				bank = frappe.get_doc("Mandi Bank Master", self.bank_account)
				self.bank_name = bank.bank_name
				self.branch = bank.branch
				self.account_no = bank.account_number
				self.ifsc_code = bank.ifsc_code
			except frappe.DoesNotExistError:
				pass
