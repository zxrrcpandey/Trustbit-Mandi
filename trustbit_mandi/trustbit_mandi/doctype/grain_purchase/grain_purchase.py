# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt, nowdate, now_datetime, getdate, get_datetime
import random


class GrainPurchase(Document):
	def before_insert(self):
		"""Set defaults for new documents"""
		self.generate_transaction_no()
		self.set_default_tax_rates()
		self.fetch_hamali_rate()

	def before_save(self):
		"""Calculate all values before saving"""
		self.fetch_hamali_rate()  # Refetch rate based on current kg_of_bag
		self.fetch_bank_details()
		self.calculate_values()

	def generate_transaction_no(self):
		"""Auto-generate transaction number"""
		if not self.transaction_no:
			today = nowdate()
			random_num = random.randint(10000, 99999)
			self.transaction_no = f"TXN-{today}-{random_num}"

	def set_default_tax_rates(self):
		"""Set default tax rates if not set"""
		if not self.mandi_tax_rate:
			self.mandi_tax_rate = 1
		if not self.nirashrit_tax_rate:
			self.nirashrit_tax_rate = 0.2

	def fetch_hamali_rate(self):
		"""Fetch hamali rate from Hamali Rate Master based on contract date and bag weight"""
		if not self.contract_date:
			self.contract_date = nowdate()

		try:
			master = frappe.get_doc("Hamali Rate Master", "Mandi")
			if not master.is_active:
				self.hamali_rate = 7.50
				return

			kg_per_bag = flt(self.kg_of_bag, 2) or 60
			contract_date = getdate(self.contract_date)
			applicable_rate = None

			# Find applicable rate from history (latest entry for the contract date)
			if master.rate_history:
				best_match = None
				best_datetime = None

				for row in master.rate_history:
					row_date = getdate(row.effective_date)
					# Check if this rate was effective on or before contract date
					if row_date <= contract_date:
						# Use get_datetime for proper comparison
						row_datetime = get_datetime(row.effective_date)
						if best_datetime is None or row_datetime > best_datetime:
							best_datetime = row_datetime
							best_match = row

				if best_match:
					applicable_rate = best_match

			# Use current rate if no history match
			if not applicable_rate:
				applicable_rate = master

			# Select rate based on bag weight (60 KG or 80 KG)
			if kg_per_bag <= 60:
				self.hamali_rate = flt(applicable_rate.upto_60_kg, 2)
			else:
				self.hamali_rate = flt(applicable_rate.more_than_60_kg, 2)

			# Default if still 0
			if not self.hamali_rate:
				self.hamali_rate = 7.50

		except frappe.DoesNotExistError:
			self.hamali_rate = 7.50

	def fetch_bank_details(self):
		"""Auto-fill bank details from Mandi Bank Master"""
		if self.bank_account:
			try:
				bank = frappe.get_doc("Mandi Bank Master", self.bank_account)
				self.bank_name = bank.bank_name
				self.account_number = bank.account_number
				self.branch = bank.branch
				self.ifsc_code = bank.ifsc_code
			except frappe.DoesNotExistError:
				pass

	def calculate_values(self):
		"""Calculate weight, amount, hamali, and taxes"""
		# Weight Calculation (in Quintal)
		kg_per_bag = flt(self.kg_of_bag, 2) or 60
		actual_bags = flt(self.actual_bag, 2)
		nos_kg = flt(self.nos_kg, 2)

		self.actual_weight = round((actual_bags * (kg_per_bag / 100)) + (nos_kg / 100), 2)

		# Amount Calculation
		auction_rate = flt(self.auction_rate, 2)
		self.amount = round(auction_rate * self.actual_weight, 2)

		# Hamali Calculation
		hamali_rate = flt(self.hamali_rate, 2)
		if self.hamali_rate_include:
			self.hamali = 0
			self.net_amount = round(self.amount)
		else:
			total_bags_for_hamali = actual_bags + (nos_kg / 100)
			self.hamali = round(total_bags_for_hamali * hamali_rate)
			self.net_amount = round(self.amount - self.hamali)

		# Tax Calculations
		mandi_tax_rate = flt(self.mandi_tax_rate, 2) or 1
		nirashrit_tax_rate = flt(self.nirashrit_tax_rate, 2) or 0.2

		self.mandi_tax = round((self.amount * mandi_tax_rate) / 100, 2)
		self.nirashrit_tax = round((self.amount * nirashrit_tax_rate) / 100, 2)
		self.total_tax = round(self.mandi_tax + self.nirashrit_tax, 2)
