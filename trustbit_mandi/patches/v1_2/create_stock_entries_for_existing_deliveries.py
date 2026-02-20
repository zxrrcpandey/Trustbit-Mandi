import frappe


def execute():
	"""Create Mandi Stock Entry (Issue) for all submitted Deal Deliveries
	that don't already have a linked stock entry."""

	# Check if Mandi Stock Entry table exists (in case this runs before migrate)
	if not frappe.db.table_exists("tabMandi Stock Entry"):
		return

	deliveries = frappe.db.sql(
		"""
		SELECT name
		FROM `tabDeal Delivery`
		WHERE docstatus = 1
		  AND name NOT IN (
			  SELECT deal_delivery FROM `tabMandi Stock Entry`
			  WHERE docstatus IN (0, 1) AND deal_delivery IS NOT NULL AND deal_delivery != ''
		  )
		ORDER BY delivery_date ASC
	""",
		as_dict=True,
	)

	if not deliveries:
		return

	from trustbit_mandi.trustbit_mandi.doctype.mandi_stock_entry.mandi_stock_entry import (
		create_stock_entry_from_delivery,
	)

	for dd in deliveries:
		try:
			create_stock_entry_from_delivery(dd.name)
		except Exception:
			frappe.log_error(
				title="Patch: Stock entry creation failed for {0}".format(dd.name)
			)

	frappe.db.commit()
