# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	chart = get_chart(data)
	report_summary = get_report_summary(data)
	return columns, data, None, chart, report_summary


def get_columns():
	return [
		{"fieldname": "deposit_date", "label": _("Deposit Date"), "fieldtype": "Date", "width": 120},
		{"fieldname": "tax_deposit_for", "label": _("Tax Deposit For"), "fieldtype": "Data", "width": 130},
		{"fieldname": "tax_type", "label": _("Tax Type"), "fieldtype": "Data", "width": 130},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 150},
		{"fieldname": "payment_mode", "label": _("Payment Mode"), "fieldtype": "Data", "width": 130},
		{"fieldname": "utr_no", "label": _("UTR No"), "fieldtype": "Data", "width": 150},
		{"fieldname": "receive_no", "label": _("Receive No"), "fieldtype": "Data", "width": 120},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 100}
	]


def get_data(filters):
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	period = filters.get("period")
	tax_deposit_for = filters.get("tax_deposit_for")
	tax_type = filters.get("tax_type")

	today = frappe.utils.nowdate()

	if period == "Monthly":
		from_date = frappe.utils.get_first_day(today)
		to_date = frappe.utils.get_last_day(today)
	elif period == "Quarterly":
		from_date = frappe.utils.add_months(frappe.utils.get_first_day(today), -2)
		to_date = frappe.utils.get_last_day(today)
	elif period == "Half-Yearly":
		from_date = frappe.utils.add_months(today, -6)
		to_date = today
	elif period == "Yearly":
		from_date = frappe.utils.add_months(today, -12)
		to_date = today
	else:
		if not from_date:
			from_date = frappe.utils.add_months(today, -3)
		if not to_date:
			to_date = today

	conditions = ["docstatus < 2", "deposit_date >= %s", "deposit_date <= %s"]
	values = [from_date, to_date]

	if tax_deposit_for:
		conditions.append("tax_deposit_for = %s")
		values.append(tax_deposit_for)

	if tax_type:
		conditions.append("tax_type = %s")
		values.append(tax_type)

	sql = """
		SELECT
			deposit_date,
			tax_deposit_for,
			tax_type,
			amount,
			payment_mode,
			utr_no,
			receive_no,
			status
		FROM `tabTax Payment Record`
		WHERE {conditions}
		ORDER BY deposit_date DESC
	""".format(conditions=" AND ".join(conditions))

	rows = frappe.db.sql(sql, values, as_dict=True)

	return rows


def get_chart(data):
	mandi_total = sum([r.get("amount", 0) for r in data if r.get("tax_type") == "Mandi Tax"])
	nirashrit_total = sum([r.get("amount", 0) for r in data if r.get("tax_type") == "Nirashrit Tax"])

	return {
		"data": {
			"labels": ["Mandi Tax", "Nirashrit Tax"],
			"datasets": [
				{
					"name": "Amount Paid",
					"values": [mandi_total, nirashrit_total]
				}
			]
		},
		"type": "bar",
		"colors": ["#5e64ff", "#ffa00a"]
	}


def get_report_summary(data):
	total_amount = sum([r.get("amount", 0) for r in data])
	mandi_total = sum([r.get("amount", 0) for r in data if r.get("tax_type") == "Mandi Tax"])
	nirashrit_total = sum([r.get("amount", 0) for r in data if r.get("tax_type") == "Nirashrit Tax"])

	return [
		{"value": total_amount, "label": _("Total Paid"), "datatype": "Currency", "indicator": "Green"},
		{"value": mandi_total, "label": _("Mandi Tax"), "datatype": "Currency", "indicator": "Blue"},
		{"value": nirashrit_total, "label": _("Nirashrit Tax"), "datatype": "Currency", "indicator": "Orange"}
	]
