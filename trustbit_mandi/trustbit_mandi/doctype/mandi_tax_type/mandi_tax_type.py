# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class MandiTaxType(Document):
	def validate(self):
		if not self.is_default:
			return
		if not self.tax_category:
			frappe.throw(_("Set a Tax Category before marking this as Default."))
		if not self.is_active:
			frappe.throw(_("An inactive Tax Type cannot be the Default."))
		existing = frappe.db.get_value(
			"Mandi Tax Type",
			{"tax_category": self.tax_category, "is_default": 1, "name": ("!=", self.name)},
			"name",
		)
		if existing:
			frappe.throw(
				_("{0} is already the Default for {1}. Untick it there first.").format(
					frappe.bold(existing), frappe.bold(self.tax_category)
				)
			)
