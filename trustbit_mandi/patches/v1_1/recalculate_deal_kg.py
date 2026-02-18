"""Recalculate all Deal delivery tracking after quintal → KG migration.

Since field names changed (delivered_quintal → delivered_kg, etc.),
new columns are empty. This patch recalculates all delivery data in KG.
"""
import frappe
from frappe.utils import flt


def execute():
	# Recalculate all Deal Delivery totals (total_delivery_kg)
	deliveries = frappe.get_all("Deal Delivery", pluck="name")
	for dd_name in deliveries:
		dd = frappe.get_doc("Deal Delivery", dd_name)
		total_kg = 0
		for row in dd.items:
			total_kg += flt(row.deliver_qty) * flt(row.pack_weight_kg)
		frappe.db.set_value("Deal Delivery", dd_name, "total_delivery_kg", total_kg)

	# Recalculate all Deal item-level KG tracking
	deals = frappe.get_all("Deal", pluck="name")
	for deal_name in deals:
		deal = frappe.get_doc("Deal", deal_name)

		for row in deal.items:
			# Calculate delivered KG from delivery items
			result = frappe.db.sql("""
				SELECT COALESCE(SUM(sdi.deliver_qty * sdi.pack_weight_kg), 0)
				FROM `tabDeal Delivery Item` sdi
				INNER JOIN `tabDeal Delivery` sd ON sd.name = sdi.parent
				WHERE sdi.soda = %s AND sdi.deal_item = %s
			""", (deal_name, row.name))

			delivered_kg = flt(result[0][0]) if result else 0
			booked_kg = flt(row.qty) * flt(row.pack_weight_kg)
			pending_kg = booked_kg - delivered_kg

			frappe.db.sql("""
				UPDATE `tabDeal Item`
				SET delivered_kg = %s, pending_kg = %s
				WHERE name = %s
			""", (delivered_kg, pending_kg, row.name))

		# Recalculate Deal totals
		total_kg = sum(flt(r.qty) * flt(r.pack_weight_kg) for r in deal.items)
		total_delivered_kg = sum(
			flt(frappe.db.get_value("Deal Item", r.name, "delivered_kg"))
			for r in deal.items
		)
		total_pending_kg = total_kg - total_delivered_kg

		frappe.db.set_value("Deal", deal_name, {
			"total_kg": total_kg,
			"total_delivered_kg": total_delivered_kg,
			"total_pending_kg": total_pending_kg
		})

	frappe.db.commit()
