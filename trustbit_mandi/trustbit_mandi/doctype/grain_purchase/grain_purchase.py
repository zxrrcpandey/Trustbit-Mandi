# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class GrainPurchase(Document):
	def before_save(self):
		self.calculate_values()

	def calculate_values(self):
		# Weight Calculation
		kg_per_bag = float(self.kg_of_bag or 60)
		actual_bags = float(self.actual_bag or 0)
		nos_kg = float(self.nos_kg or 0)

		self.actual_weight = (actual_bags * (kg_per_bag / 100)) + (nos_kg / 100)

		# Amount Calculation
		auction_rate = float(self.auction_rate or 0)
		self.amount = auction_rate * self.actual_weight

		# Hamali Calculation
		hamali_rate = float(self.hamali_rate or 0)
		if self.hamali_rate_include:
			self.hamali = 0
			self.net_amount = round(self.amount)
		else:
			total_bags_for_hamali = actual_bags + (nos_kg / 100)
			self.hamali = round(total_bags_for_hamali * hamali_rate)
			self.net_amount = round(self.amount - self.hamali)

		# Tax Calculations
		mandi_tax_rate = float(self.mandi_tax_rate or 1)
		nirashrit_tax_rate = float(self.nirashrit_tax_rate or 0.2)

		self.mandi_tax = round((self.amount * mandi_tax_rate) / 100, 2)
		self.nirashrit_tax = round((self.amount * nirashrit_tax_rate) / 100, 2)
		self.total_tax = round(self.mandi_tax + self.nirashrit_tax, 2)
