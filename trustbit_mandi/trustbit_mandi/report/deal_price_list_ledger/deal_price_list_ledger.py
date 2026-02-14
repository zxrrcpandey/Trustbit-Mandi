# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, flt, getdate


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"fieldname": "sno", "label": _("S.No."), "fieldtype": "Int", "width": 50},
		{"fieldname": "price_list_area", "label": _("Area"), "fieldtype": "Link", "options": "Deal Price List Area", "width": 120},
		{"fieldname": "item", "label": _("Item"), "fieldtype": "Link", "options": "Item", "width": 130},
		{"fieldname": "item_group", "label": _("Item Group"), "fieldtype": "Data", "width": 100},
		{"fieldname": "last_day_price", "label": _("Last Day Price (50KG)"), "fieldtype": "Currency", "width": 150},
		{"fieldname": "last_day_ppkg", "label": _("Last Day /KG"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "current_price", "label": _("Current Price (50KG)"), "fieldtype": "Currency", "width": 150},
		{"fieldname": "current_ppkg", "label": _("Current /KG"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "change", "label": _("Change (50KG)"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "effective_datetime", "label": _("Latest Update"), "fieldtype": "Datetime", "width": 160},
		{"fieldname": "name", "label": _("Price List ID"), "fieldtype": "Link", "options": "Deal Price List", "width": 150},
	]


def get_data(filters):
	conditions = ["1=1"]
	values = []

	if filters.get("price_list_area"):
		conditions.append("spl.price_list_area = %s")
		values.append(filters["price_list_area"])

	if filters.get("item"):
		conditions.append("spl.item = %s")
		values.append(filters["item"])

	if filters.get("item_group"):
		conditions.append("spl.item_group = %s")
		values.append(filters["item_group"])

	# Get all unique area+item combos
	combos_sql = """
		SELECT DISTINCT spl.price_list_area, spl.item, spl.item_group
		FROM `tabDeal Price List` spl
		WHERE {conditions} AND spl.is_active = 1
		ORDER BY spl.price_list_area ASC, spl.item ASC
	""".format(conditions=" AND ".join(conditions))

	combos = frappe.db.sql(combos_sql, values, as_dict=True)

	today = getdate(filters.get("to_date") or nowdate())
	last_day = getdate(filters.get("from_date") or add_days(today, -1))

	# End of last_day and end of today
	last_day_end = str(last_day) + " 23:59:59"
	today_end = str(today) + " 23:59:59"

	data = []
	sno = 0

	for combo in combos:
		# Get last day's latest price (latest entry on or before last_day end)
		last_day_entry = frappe.db.sql("""
			SELECT name, base_price_50kg, price_per_kg, effective_datetime
			FROM `tabDeal Price List`
			WHERE price_list_area = %s AND item = %s AND is_active = 1
			  AND effective_datetime <= %s
			ORDER BY effective_datetime DESC
			LIMIT 1
		""", (combo.price_list_area, combo.item, last_day_end), as_dict=True)

		# Get current price (latest entry on or before today end)
		current_entry = frappe.db.sql("""
			SELECT name, base_price_50kg, price_per_kg, effective_datetime
			FROM `tabDeal Price List`
			WHERE price_list_area = %s AND item = %s AND is_active = 1
			  AND effective_datetime <= %s
			ORDER BY effective_datetime DESC
			LIMIT 1
		""", (combo.price_list_area, combo.item, today_end), as_dict=True)

		last_price = flt(last_day_entry[0].base_price_50kg) if last_day_entry else 0
		last_ppkg = flt(last_day_entry[0].price_per_kg) if last_day_entry else 0
		curr_price = flt(current_entry[0].base_price_50kg) if current_entry else 0
		curr_ppkg = flt(current_entry[0].price_per_kg) if current_entry else 0
		change = curr_price - last_price

		sno += 1
		data.append({
			"sno": sno,
			"price_list_area": combo.price_list_area,
			"item": combo.item,
			"item_group": combo.item_group,
			"last_day_price": last_price,
			"last_day_ppkg": last_ppkg,
			"current_price": curr_price,
			"current_ppkg": curr_ppkg,
			"change": change,
			"effective_datetime": current_entry[0].effective_datetime if current_entry else None,
			"name": current_entry[0].name if current_entry else None,
		})

	return data
