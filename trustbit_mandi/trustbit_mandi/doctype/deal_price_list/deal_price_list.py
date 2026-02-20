# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


class DealPriceList(Document):
	def before_save(self):
		self.calculate_price_per_kg()

	def calculate_price_per_kg(self):
		if flt(self.base_price_50kg) > 0:
			self.price_per_kg = flt(self.base_price_50kg) / 50
		else:
			self.price_per_kg = 0


@frappe.whitelist()
def get_all_prices_for_area(price_list_area):
	"""Get all active item prices for an area + all active pack sizes."""
	now = now_datetime()

	# Get latest active price per item for this area using subquery
	prices = frappe.db.sql("""
		SELECT dpl.name as price_list_name, dpl.item, dpl.item_group,
			dpl.base_price_50kg, dpl.price_per_kg,
			i.item_name, i.item_group as item_group_link
		FROM `tabDeal Price List` dpl
		INNER JOIN `tabItem` i ON i.name = dpl.item
		WHERE dpl.price_list_area = %s
		  AND dpl.is_active = 1
		  AND dpl.effective_datetime = (
			SELECT MAX(dpl2.effective_datetime)
			FROM `tabDeal Price List` dpl2
			WHERE dpl2.price_list_area = dpl.price_list_area
			  AND dpl2.item = dpl.item
			  AND dpl2.is_active = 1
			  AND dpl2.effective_datetime <= %s
		  )
		ORDER BY i.item_name
	""", (price_list_area, now), as_dict=True)

	pack_sizes = frappe.db.sql("""
		SELECT name as pack_size, weight_kg
		FROM `tabDeal Pack Size`
		WHERE is_active = 1
		ORDER BY weight_kg DESC
	""", as_dict=True)

	# Get bag costs: item + pack_size -> bag_cost
	bag_costs = frappe.db.sql("""
		SELECT item, pack_size, bag_cost
		FROM `tabPackage Bag Master`
		WHERE is_active = 1
	""", as_dict=True)

	bag_cost_map = {}
	for bc in bag_costs:
		bag_cost_map[bc.item + ":" + bc.pack_size] = flt(bc.bag_cost)

	return {
		"prices": prices,
		"pack_sizes": pack_sizes,
		"bag_cost_map": bag_cost_map
	}


@frappe.whitelist()
def get_latest_price(price_list_area, item, as_of_datetime=None):
	"""Get the latest active price for an area+item combination."""
	if not as_of_datetime:
		as_of_datetime = now_datetime()

	price = frappe.db.sql("""
		SELECT name, base_price_50kg, price_per_kg, effective_datetime
		FROM `tabDeal Price List`
		WHERE price_list_area = %s
		  AND item = %s
		  AND is_active = 1
		  AND effective_datetime <= %s
		ORDER BY effective_datetime DESC
		LIMIT 1
	""", (price_list_area, item, as_of_datetime), as_dict=True)

	if price:
		return price[0]
	return None


@frappe.whitelist()
def get_rate_for_pack_size(price_list_area, item, pack_size, as_of_datetime=None):
	"""Get the calculated rate for a specific pack size.
	rate = price_per_kg * weight_kg
	"""
	latest = get_latest_price(price_list_area, item, as_of_datetime)
	if not latest:
		return None

	weight_kg = frappe.db.get_value("Deal Pack Size", pack_size, "weight_kg")
	if not weight_kg:
		return None

	base_rate = flt(latest.get("price_per_kg")) * flt(weight_kg)

	bag_cost = flt(frappe.db.get_value("Package Bag Master",
		{"item": item, "pack_size": pack_size, "is_active": 1}, "bag_cost"))

	rate = base_rate + bag_cost

	return {
		"rate": rate,
		"base_price_50kg": latest.get("base_price_50kg"),
		"price_per_kg": latest.get("price_per_kg"),
		"pack_weight_kg": flt(weight_kg),
		"bag_cost": bag_cost,
		"price_list_name": latest.get("name"),
		"effective_datetime": str(latest.get("effective_datetime"))
	}


@frappe.whitelist()
def get_items_with_prices(price_list_area):
	"""Get all enabled items with current and previous price for the given area."""
	now = now_datetime()

	return frappe.db.sql("""
		SELECT i.name as item, i.item_name,
			(SELECT dpl1.base_price_50kg
			 FROM `tabDeal Price List` dpl1
			 WHERE dpl1.item = i.name AND dpl1.price_list_area = %(area)s
			   AND dpl1.is_active = 1 AND dpl1.effective_datetime <= %(now)s
			 ORDER BY dpl1.effective_datetime DESC LIMIT 1
			) as current_price,
			(SELECT dpl2.base_price_50kg
			 FROM `tabDeal Price List` dpl2
			 WHERE dpl2.item = i.name AND dpl2.price_list_area = %(area)s
			   AND dpl2.is_active = 1 AND dpl2.effective_datetime <= %(now)s
			 ORDER BY dpl2.effective_datetime DESC LIMIT 1 OFFSET 1
			) as last_price
		FROM `tabItem` i
		WHERE i.disabled = 0
		ORDER BY i.item_name
	""", {"area": price_list_area, "now": now}, as_dict=True)


@frappe.whitelist()
def bulk_update_prices(price_list_area, updates):
	"""Create new Deal Price List records for multiple items at once."""
	if isinstance(updates, str):
		updates = json.loads(updates)

	if not updates:
		frappe.throw(_("No price updates provided"))

	count = 0
	effective = now_datetime()

	for row in updates:
		item = row.get("item")
		base_price = flt(row.get("base_price_50kg"))
		if not item or base_price <= 0:
			continue

		dpl = frappe.new_doc("Deal Price List")
		dpl.price_list_area = price_list_area
		dpl.item = item
		dpl.base_price_50kg = base_price
		dpl.effective_datetime = effective
		dpl.is_active = 1
		dpl.insert(ignore_permissions=True)
		count += 1

	frappe.db.commit()
	return count
