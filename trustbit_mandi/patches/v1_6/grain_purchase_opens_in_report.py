import frappe


def execute():
	"""The Mandi home shortcut to Grain Purchase opens its Report view.

	Only this one row is changed, so a Mandi workspace customised on the site keeps the rest.
	"""
	frappe.db.set_value(
		"Workspace Shortcut",
		{"parent": "Mandi", "link_to": "Grain Purchase", "doc_view": "List"},
		"doc_view",
		"Report",
		update_modified=False,
	)
