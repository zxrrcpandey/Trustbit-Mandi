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
		{"fieldname": "delivery_date", "label": _("Delivery Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "delivery_name", "label": _("Delivery ID"), "fieldtype": "Link", "options": "Deal Delivery", "width": 160},
		{"fieldname": "vehicle_dispatch", "label": _("Vehicle Dispatch"), "fieldtype": "Link", "options": "Vehicle Dispatch", "width": 160},
		{"fieldname": "customer_name", "label": _("Customer"), "fieldtype": "Data", "width": 140},
		{"fieldname": "item_name", "label": _("Item"), "fieldtype": "Data", "width": 130},
		{"fieldname": "pack_size", "label": _("Pack Size"), "fieldtype": "Link", "options": "Deal Pack Size", "width": 80},
		{"fieldname": "deliver_qty", "label": _("Qty (Packs)"), "fieldtype": "Float", "width": 90},
		{"fieldname": "deliver_kg", "label": _("KG"), "fieldtype": "Float", "width": 90},
		{"fieldname": "rate", "label": _("Rate"), "fieldtype": "Currency", "width": 90},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "deal_name", "label": _("Deal"), "fieldtype": "Link", "options": "Deal", "width": 150},
		{"fieldname": "is_extra", "label": _("Extra"), "fieldtype": "Check", "width": 55},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 120},
	]


def get_data(filters):
	conditions = ["dd.docstatus IN (1, 2)"]
	values = []

	if filters.get("from_date"):
		conditions.append("dd.delivery_date >= %s")
		values.append(filters["from_date"])

	if filters.get("to_date"):
		conditions.append("dd.delivery_date <= %s")
		values.append(filters["to_date"])

	if filters.get("customer"):
		conditions.append("dd.customer = %s")
		values.append(filters["customer"])

	if filters.get("item"):
		conditions.append("ddi.item = %s")
		values.append(filters["item"])

	if filters.get("vehicle_dispatch"):
		conditions.append("dd.vehicle_dispatch = %s")
		values.append(filters["vehicle_dispatch"])

	if filters.get("status"):
		status = filters["status"]
		if status == "Submitted":
			conditions.append("dd.docstatus = 1")
		elif status == "Cancelled":
			conditions.append("dd.docstatus = 2")

	sql = """
		SELECT
			dd.delivery_date,
			dd.name as delivery_name,
			dd.vehicle_dispatch,
			dd.customer,
			dd.customer_name,
			dd.status,
			dd.docstatus,
			ddi.item,
			i.item_name,
			ddi.pack_size,
			ddi.pack_weight_kg,
			ddi.deliver_qty,
			ddi.rate,
			ddi.amount,
			ddi.soda as deal_name,
			ddi.is_extra
		FROM `tabDeal Delivery Item` ddi
		INNER JOIN `tabDeal Delivery` dd ON dd.name = ddi.parent
		LEFT JOIN `tabItem` i ON i.name = ddi.item
		WHERE {conditions}
		ORDER BY dd.delivery_date ASC, dd.creation ASC, ddi.idx ASC
	""".format(conditions=" AND ".join(conditions))

	data = frappe.db.sql(sql, values, as_dict=True)

	sno = 0
	for row in data:
		sno += 1
		row["sno"] = sno
		row["deliver_kg"] = flt(row.deliver_qty) * flt(row.pack_weight_kg)

	# Total row
	if data:
		total_qty = sum(flt(r.get("deliver_qty")) for r in data)
		total_kg = sum(flt(r.get("deliver_kg")) for r in data)
		total_amount = sum(flt(r.get("amount")) for r in data)

		data.append({
			"sno": "",
			"customer_name": "<b>TOTAL</b>",
			"deliver_qty": total_qty,
			"deliver_kg": total_kg,
			"amount": total_amount,
		})

	return data


def get_report_summary(data):
	report_data = [r for r in data if r.get("sno") != ""]

	total_deliveries = len(set(r.get("delivery_name") for r in report_data))
	total_qty = sum(flt(r.get("deliver_qty")) for r in report_data)
	total_kg = sum(flt(r.get("deliver_kg")) for r in report_data)
	total_amount = sum(flt(r.get("amount")) for r in report_data)
	total_customers = len(set(r.get("customer") for r in report_data if r.get("customer")))

	return [
		{"value": total_deliveries, "label": _("Total Deliveries"), "datatype": "Int", "indicator": "Blue"},
		{"value": total_customers, "label": _("Customers"), "datatype": "Int", "indicator": "Blue"},
		{"value": total_qty, "label": _("Total Packs"), "datatype": "Float", "indicator": "Green"},
		{"value": total_kg, "label": _("Total KG"), "datatype": "Float", "indicator": "Green"},
		{"value": total_amount, "label": _("Total Amount"), "datatype": "Currency", "indicator": "Blue"},
	]
