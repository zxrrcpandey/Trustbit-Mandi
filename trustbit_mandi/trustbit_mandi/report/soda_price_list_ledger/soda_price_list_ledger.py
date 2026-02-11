# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"fieldname": "sno", "label": _("S.No."), "fieldtype": "Int", "width": 50},
		{"fieldname": "effective_datetime", "label": _("Effective Date Time"), "fieldtype": "Datetime", "width": 160},
		{"fieldname": "price_list_area", "label": _("Area"), "fieldtype": "Link", "options": "Soda Price List Area", "width": 120},
		{"fieldname": "item", "label": _("Item"), "fieldtype": "Link", "options": "Item", "width": 150},
		{"fieldname": "item_group", "label": _("Item Group"), "fieldtype": "Data", "width": 120},
		{"fieldname": "base_price_50kg", "label": _("Base Price (50KG)"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "price_per_kg", "label": _("Price/KG"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "is_active", "label": _("Active"), "fieldtype": "Check", "width": 60},
		{"fieldname": "remarks", "label": _("Remarks"), "fieldtype": "Data", "width": 150},
		{"fieldname": "name", "label": _("ID"), "fieldtype": "Link", "options": "Soda Price List", "width": 140},
	]


def get_data(filters):
	conditions = ["1=1"]
	values = []

	if filters.get("price_list_area"):
		conditions.append("price_list_area = %s")
		values.append(filters["price_list_area"])

	if filters.get("item"):
		conditions.append("item = %s")
		values.append(filters["item"])

	if filters.get("item_group"):
		conditions.append("item_group = %s")
		values.append(filters["item_group"])

	if filters.get("from_date"):
		conditions.append("effective_datetime >= %s")
		values.append(filters["from_date"])

	if filters.get("to_date"):
		conditions.append("effective_datetime <= %s")
		values.append(filters["to_date"] + " 23:59:59")

	sql = """
		SELECT name, effective_datetime, price_list_area, item, item_group,
		       base_price_50kg, price_per_kg, is_active, remarks
		FROM `tabSoda Price List`
		WHERE {conditions}
		ORDER BY price_list_area ASC, item ASC, effective_datetime DESC
	""".format(conditions=" AND ".join(conditions))

	data = frappe.db.sql(sql, values, as_dict=True)

	sno = 0
	for row in data:
		sno += 1
		row["sno"] = sno

	return data
