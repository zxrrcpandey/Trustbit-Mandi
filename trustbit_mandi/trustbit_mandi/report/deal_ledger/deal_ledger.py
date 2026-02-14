# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	report_summary = get_report_summary(data)
	return columns, data, None, None, report_summary


def get_columns():
	return [
		{"fieldname": "sno", "label": _("S.No."), "fieldtype": "Int", "width": 50},
		{"fieldname": "soda_date", "label": _("Deal Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "name", "label": _("Deal ID"), "fieldtype": "Link", "options": "Deal", "width": 150},
		{"fieldname": "customer_name", "label": _("Customer"), "fieldtype": "Data", "width": 130},
		{"fieldname": "item_name", "label": _("Item"), "fieldtype": "Data", "width": 130},
		{"fieldname": "pack_size", "label": _("Pack Size"), "fieldtype": "Link", "options": "Deal Pack Size", "width": 80},
		{"fieldname": "sales_type", "label": _("Type"), "fieldtype": "Data", "width": 50},
		{"fieldname": "price_list_area", "label": _("Area"), "fieldtype": "Data", "width": 100},
		{"fieldname": "qty", "label": _("Booked Qty"), "fieldtype": "Float", "width": 90},
		{"fieldname": "rate", "label": _("Rate"), "fieldtype": "Currency", "width": 90},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "delivered_qty", "label": _("Delivered"), "fieldtype": "Float", "width": 80},
		{"fieldname": "pending_qty", "label": _("Pending"), "fieldtype": "Float", "width": 80},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 110},
		{"fieldname": "last_delivery_date", "label": _("Last Delivery"), "fieldtype": "Date", "width": 100},
	]


def get_data(filters):
	conditions = ["1=1"]
	values = []

	if filters.get("from_date"):
		conditions.append("s.soda_date >= %s")
		values.append(filters["from_date"])

	if filters.get("to_date"):
		conditions.append("s.soda_date <= %s")
		values.append(filters["to_date"])

	if filters.get("customer"):
		conditions.append("s.customer = %s")
		values.append(filters["customer"])

	if filters.get("item"):
		conditions.append("s.item = %s")
		values.append(filters["item"])

	if filters.get("price_list_area"):
		conditions.append("s.price_list_area = %s")
		values.append(filters["price_list_area"])

	if filters.get("status"):
		conditions.append("s.status = %s")
		values.append(filters["status"])

	if filters.get("sales_type"):
		conditions.append("s.sales_type = %s")
		values.append(filters["sales_type"])

	sql = """
		SELECT
			s.name, s.soda_date, s.customer, s.customer_name,
			s.item, s.item_name, s.pack_size, s.sales_type,
			s.price_list_area, s.qty, s.rate, s.amount,
			s.delivered_qty, s.pending_qty, s.status,
			(SELECT MAX(sd.delivery_date)
			 FROM `tabDeal Delivery Item` sdi
			 INNER JOIN `tabDeal Delivery` sd ON sd.name = sdi.parent
			 WHERE sdi.soda = s.name) as last_delivery_date
		FROM `tabDeal` s
		WHERE {conditions}
		ORDER BY s.soda_date ASC, s.creation ASC
	""".format(conditions=" AND ".join(conditions))

	data = frappe.db.sql(sql, values, as_dict=True)

	sno = 0
	for row in data:
		sno += 1
		row["sno"] = sno

	# Total row
	if data:
		total_qty = sum([flt(r.get("qty")) for r in data])
		total_amount = sum([flt(r.get("amount")) for r in data])
		total_delivered = sum([flt(r.get("delivered_qty")) for r in data])
		total_pending = sum([flt(r.get("pending_qty")) for r in data])

		data.append({
			"sno": "",
			"customer_name": "<b>TOTAL</b>",
			"qty": total_qty,
			"amount": total_amount,
			"delivered_qty": total_delivered,
			"pending_qty": total_pending,
		})

	return data


def get_report_summary(data):
	report_data = [r for r in data if r.get("sno") != ""]

	total_qty = sum([flt(r.get("qty")) for r in report_data])
	total_amount = sum([flt(r.get("amount")) for r in report_data])
	total_delivered = sum([flt(r.get("delivered_qty")) for r in report_data])
	total_pending = sum([flt(r.get("pending_qty")) for r in report_data])

	return [
		{"value": total_qty, "label": _("Total Booked"), "datatype": "Float", "indicator": "Blue"},
		{"value": total_delivered, "label": _("Total Delivered"), "datatype": "Float", "indicator": "Green"},
		{"value": total_pending, "label": _("Total Pending"), "datatype": "Float", "indicator": "Orange"},
		{"value": total_amount, "label": _("Total Amount"), "datatype": "Currency", "indicator": "Blue"},
	]
