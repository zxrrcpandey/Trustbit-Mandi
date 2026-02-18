"""Fix item_status after quintal → KG migration.

The recalculate_deal_kg patch updated KG values but didn't recalculate item_status.
This patch recalculates item_status based on KG comparison.
"""
import frappe
from frappe.utils import flt


def execute():
	deals = frappe.get_all("Deal", pluck="name")
	for deal_name in deals:
		deal = frappe.get_doc("Deal", deal_name)
		if deal.status == "Cancelled":
			continue

		changed = False
		for row in deal.items:
			booked_kg = flt(row.qty) * flt(row.pack_weight_kg)
			delivered_kg = flt(row.delivered_kg)

			if delivered_kg <= 0:
				new_status = "Open"
			elif delivered_kg >= booked_kg - 0.1:
				new_status = "Delivered"
			else:
				new_status = "Partially Delivered"

			if row.item_status != new_status:
				frappe.db.set_value("Deal Item", row.name, "item_status", new_status)
				changed = True

		if changed:
			# Recalculate deal parent status
			items = frappe.get_all("Deal Item", filters={"parent": deal_name}, fields=["item_status"])
			statuses = [r.item_status for r in items]

			if all(s == "Delivered" for s in statuses):
				new_deal_status = "Delivered"
			elif any(s in ("Partially Delivered", "Delivered") for s in statuses):
				new_deal_status = "Partially Delivered"
			else:
				new_deal_status = deal.status if deal.status in ("Open", "Confirmed") else "Open"

			if deal.status != new_deal_status:
				frappe.db.set_value("Deal", deal_name, "status", new_deal_status)

	frappe.db.commit()
