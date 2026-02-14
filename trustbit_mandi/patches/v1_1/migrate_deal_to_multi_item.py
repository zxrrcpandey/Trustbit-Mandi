import frappe
from frappe.utils import flt


def execute():
	"""Migrate existing single-item Deals to multi-item Deal Item child table.

	This patch runs post_model_sync so tabDeal Item already exists.
	Old columns (item, pack_size, qty, rate, etc.) remain on tabDeal since
	Frappe doesn't drop columns automatically.
	"""

	# Check if old columns still exist on tabDeal
	columns = frappe.db.get_table_columns("Deal")
	if "item" not in columns:
		# Already migrated or fresh install - nothing to do
		return

	# Get all Deals that have old item data but no Deal Item child rows yet
	deals = frappe.db.sql("""
		SELECT d.name, d.item, d.item_name, d.pack_size, d.pack_weight_kg,
			d.qty, d.rate, d.amount, d.base_price_50kg, d.price_per_kg,
			d.price_list_ref, d.delivered_qty, d.pending_qty
		FROM `tabDeal` d
		WHERE d.item IS NOT NULL AND d.item != ''
		  AND NOT EXISTS (
			SELECT 1 FROM `tabDeal Item` di WHERE di.parent = d.name
		  )
	""", as_dict=True)

	if not deals:
		return

	for deal in deals:
		# Determine item_status
		delivered = flt(deal.delivered_qty)
		qty = flt(deal.qty)

		if delivered <= 0:
			item_status = "Open"
		elif delivered >= qty:
			item_status = "Delivered"
		else:
			item_status = "Partially Delivered"

		# Create Deal Item child row
		child_name = frappe.generate_hash(length=10)
		frappe.db.sql("""
			INSERT INTO `tabDeal Item`
				(name, parent, parenttype, parentfield, idx, docstatus,
				 item, item_name, pack_size, pack_weight_kg,
				 qty, rate, amount, base_price_50kg, price_per_kg,
				 price_list_ref, delivered_qty, pending_qty, item_status,
				 creation, modified, modified_by, owner)
			VALUES
				(%s, %s, 'Deal', 'items', 1, 0,
				 %s, %s, %s, %s,
				 %s, %s, %s, %s, %s,
				 %s, %s, %s, %s,
				 NOW(), NOW(), 'Administrator', 'Administrator')
		""", (
			child_name, deal.name,
			deal.item, deal.item_name, deal.pack_size, flt(deal.pack_weight_kg),
			flt(deal.qty), flt(deal.rate), flt(deal.amount),
			flt(deal.base_price_50kg), flt(deal.price_per_kg),
			deal.price_list_ref, flt(deal.delivered_qty), flt(deal.pending_qty),
			item_status
		))

		# Update Deal parent totals
		frappe.db.sql("""
			UPDATE `tabDeal`
			SET total_qty = %s, total_amount = %s
			WHERE name = %s
		""", (flt(deal.qty), flt(deal.amount), deal.name))

		# Update existing Deal Delivery Items to set deal_item reference
		frappe.db.sql("""
			UPDATE `tabDeal Delivery Item`
			SET deal_item = %s
			WHERE soda = %s AND (deal_item IS NULL OR deal_item = '')
		""", (child_name, deal.name))

	frappe.db.commit()
	frappe.msgprint(f"Migrated {len(deals)} Deal(s) to multi-item format.")
