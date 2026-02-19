"""Set all existing Deal Deliveries as submitted (docstatus=1).

Deal Delivery is now a submittable DocType. Existing deliveries need to be
marked as submitted so they continue to count towards deal fulfillment.
"""
import frappe


def execute():
	# Set all existing Deal Deliveries to submitted
	frappe.db.sql("""
		UPDATE `tabDeal Delivery`
		SET docstatus = 1
		WHERE docstatus = 0
	""")

	# Also update child table rows
	frappe.db.sql("""
		UPDATE `tabDeal Delivery Item`
		SET docstatus = 1
		WHERE docstatus = 0
	""")

	frappe.db.commit()
