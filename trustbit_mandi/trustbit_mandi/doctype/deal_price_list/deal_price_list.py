# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
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
			  AND dpl2.effective_datetime <= NOW()
		  )
		ORDER BY i.item_name
	""", (price_list_area,), as_dict=True)

	pack_sizes = frappe.db.sql("""
		SELECT name as pack_size, weight_kg
		FROM `tabDeal Pack Size`
		WHERE is_active = 1
		ORDER BY weight_kg DESC
	""", as_dict=True)

	return {
		"prices": prices,
		"pack_sizes": pack_sizes
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

	rate = flt(latest.get("price_per_kg")) * flt(weight_kg)

	return {
		"rate": rate,
		"base_price_50kg": latest.get("base_price_50kg"),
		"price_per_kg": latest.get("price_per_kg"),
		"pack_weight_kg": flt(weight_kg),
		"price_list_name": latest.get("name"),
		"effective_datetime": str(latest.get("effective_datetime"))
	}
