import frappe


def execute():
	"""Tag existing Mandi Tax Types with a Tax Category and mark one Default per category,
	replacing the hard-coded "Mandi Tax" / "Nirashrit Tax" names Grain Purchase used to assume."""
	tax_types = frappe.get_all("Mandi Tax Type", fields=["name", "tax_category", "is_active"])

	for category, keyword in (("Nirashrit Tax", "nirash"), ("Mandi Tax", "mandi")):
		matches = [t for t in tax_types if keyword in t.name.lower() and not t.tax_category]
		for t in matches:
			frappe.db.set_value("Mandi Tax Type", t.name, "tax_category", category, update_modified=False)
			t.tax_category = category

		in_category = [t for t in tax_types if t.tax_category == category and t.is_active]
		if len(in_category) == 1 and not frappe.db.exists(
			"Mandi Tax Type", {"tax_category": category, "is_default": 1}
		):
			frappe.db.set_value("Mandi Tax Type", in_category[0].name, "is_default", 1, update_modified=False)

	# Interim Customize Form defaults (2026-10-01) are superseded by the Default flag
	frappe.db.delete(
		"Property Setter",
		{
			"doc_type": "Grain Purchase",
			"field_name": ("in", ["mandi_tax_type", "nirashrit_tax_type"]),
			"property": "default",
		},
	)
	frappe.clear_cache(doctype="Grain Purchase")
