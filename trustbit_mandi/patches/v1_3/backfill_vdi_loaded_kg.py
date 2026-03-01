import frappe


def execute():
	"""Backfill loaded_kg and loaded_amount for existing Vehicle Dispatch Item rows."""
	frappe.db.sql("""
		UPDATE `tabVehicle Dispatch Item`
		SET loaded_kg = COALESCE(total_kg, 0),
		    loaded_amount = COALESCE(total_amount, 0)
		WHERE loaded_kg IS NULL OR loaded_kg = 0
	""")
	frappe.db.commit()
