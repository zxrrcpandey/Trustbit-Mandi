# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PPSEntry(Document):
	def before_save(self):
		if self.amount:
			self.amount_in_words = self.convert_to_words(self.amount)

	def convert_to_words(self, amount):
		"""Convert amount to words in Indian format"""
		ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
				'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
				'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
		tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

		if amount == 0:
			return 'ZERO ONLY'

		amount = int(amount)

		def convert_less_than_hundred(num):
			if num < 20:
				return ones[num]
			return tens[num // 10] + (' ' + ones[num % 10] if num % 10 else '')

		def convert_less_than_thousand(num):
			if num < 100:
				return convert_less_than_hundred(num)
			return ones[num // 100] + ' HUNDRED' + (' ' + convert_less_than_hundred(num % 100) if num % 100 else '')

		result = ''

		# Crores (10 million)
		if amount >= 10000000:
			result += convert_less_than_thousand(amount // 10000000) + ' CRORE '
			amount %= 10000000

		# Lakhs (100 thousand)
		if amount >= 100000:
			result += convert_less_than_hundred(amount // 100000) + ' LAKH '
			amount %= 100000

		# Thousands
		if amount >= 1000:
			result += convert_less_than_hundred(amount // 1000) + ' THOUSAND '
			amount %= 1000

		# Hundreds
		if amount >= 100:
			result += ones[amount // 100] + ' HUNDRED '
			amount %= 100

		# Tens and ones
		if amount > 0:
			result += convert_less_than_hundred(amount) + ' '

		return result.strip() + ' ONLY'
