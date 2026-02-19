"""Backfill pack_weight_kg on Deal Delivery Items that have 0 weight.

Old delivery items were created before pack_weight_kg was populated,
causing KG-based tracking to break (SUM(qty * 0) = 0).
"""
import frappe


def execute():
	# Update pack_weight_kg from Deal Pack Size for rows where it's 0
	frappe.db.sql("""
		UPDATE `tabDeal Delivery Item` sdi
		INNER JOIN `tabDeal Pack Size` ps ON ps.name = sdi.pack_size
		SET sdi.pack_weight_kg = ps.weight_kg
		WHERE sdi.pack_weight_kg = 0
		  AND sdi.pack_size IS NOT NULL
		  AND sdi.pack_size != ''
	""")

	# Recalculate delivery totals (total_delivery_kg)
	deliveries = frappe.db.sql("""
		SELECT DISTINCT parent FROM `tabDeal Delivery Item`
	""", pluck="parent")

	for dd_name in deliveries:
		try:
			dd = frappe.get_doc("Deal Delivery", dd_name)
			dd.calculate_totals()
			dd.db_update()
			for row in dd.items:
				row.db_update()
		except Exception:
			pass

	# Recalculate all Deal statuses
	deals = frappe.db.sql("""
		SELECT name FROM `tabDeal`
		WHERE status NOT IN ('Cancelled')
	""", pluck="name")

	for deal_name in deals:
		try:
			deal = frappe.get_doc("Deal", deal_name)
			deal.update_delivery_status()
		except Exception:
			pass

	frappe.db.commit()
