# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	report_summary = get_report_summary(data)
	return columns, data, None, None, report_summary


def get_columns():
	return [
		{"fieldname": "sno", "label": _("S.No."), "fieldtype": "Int", "width": 50},
		{"fieldname": "contract_date", "label": _("Contract Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "contract_number", "label": _("Contract No."), "fieldtype": "Data", "width": 120},
		{"fieldname": "farmer_name", "label": _("Farmer Name"), "fieldtype": "Data", "width": 130},
		{"fieldname": "address", "label": _("Address"), "fieldtype": "Data", "width": 100},
		{"fieldname": "phone_number", "label": _("Phone"), "fieldtype": "Data", "width": 100},
		{"fieldname": "transaction_no", "label": _("Transaction No."), "fieldtype": "Data", "width": 120},
		{"fieldname": "expected_bag", "label": _("Exp. Bag"), "fieldtype": "Int", "width": 70},
		{"fieldname": "actual_bag", "label": _("Actual Bag"), "fieldtype": "Int", "width": 80},
		{"fieldname": "auction_rate", "label": _("Rate"), "fieldtype": "Currency", "width": 80},
		{"fieldname": "actual_weight", "label": _("Actual Weight"), "fieldtype": "Float", "width": 100, "precision": 2},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 100},
		{"fieldname": "hamali", "label": _("Hamali"), "fieldtype": "Currency", "width": 80},
		{"fieldname": "net_amount", "label": _("Net Amount"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "gsm", "label": _("Commodity"), "fieldtype": "Data", "width": 100},
		{"fieldname": "payment_status", "label": _("Payment Status"), "fieldtype": "Data", "width": 100},
	]


def get_data(filters):
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	payment_status = filters.get("payment_status")
	payment_mode = filters.get("payment_mode")
	gsm_filter = filters.get("gsm")

	today = frappe.utils.nowdate()

	if not from_date:
		from_date = frappe.utils.add_months(today, -1)
	if not to_date:
		to_date = today

	conditions = ["docstatus < 2", "pay_date >= %s", "pay_date <= %s"]
	values = [from_date, to_date]

	if payment_status:
		conditions.append("payment_status = %s")
		values.append(payment_status)

	if payment_mode:
		conditions.append("payment_mode = %s")
		values.append(payment_mode)

	if gsm_filter:
		conditions.append("gsm = %s")
		values.append(gsm_filter)

	sql = """
		SELECT
			contract_date,
			contract_number,
			farmer_name,
			address,
			phone_number,
			transaction_no,
			expected_bag,
			actual_bag,
			auction_rate,
			actual_weight,
			amount,
			hamali,
			net_amount,
			gsm,
			payment_status
		FROM `tabGrain Purchase`
		WHERE {conditions}
		ORDER BY gsm ASC, pay_date ASC, contract_date ASC
	""".format(conditions=" AND ".join(conditions))

	raw_data = frappe.db.sql(sql, values, as_dict=True)

	# Add serial numbers
	sno = 0
	for row in raw_data:
		sno += 1
		row["sno"] = sno

	return raw_data


def get_report_summary(data):
	total_expected = sum([(r.get("expected_bag") or 0) for r in data])
	total_actual = sum([(r.get("actual_bag") or 0) for r in data])
	total_weight = sum([(r.get("actual_weight") or 0) for r in data])
	total_amount = sum([(r.get("amount") or 0) for r in data])
	total_hamali = sum([(r.get("hamali") or 0) for r in data])
	total_net = sum([(r.get("net_amount") or 0) for r in data])

	return [
		{"value": total_net, "label": _("Total Net Amount"), "datatype": "Currency", "indicator": "Green"},
		{"value": total_amount, "label": _("Total Amount"), "datatype": "Currency", "indicator": "Blue"},
		{"value": total_hamali, "label": _("Total Hamali"), "datatype": "Currency", "indicator": "Orange"},
		{"value": total_weight, "label": _("Total Weight (Qtl)"), "datatype": "Float", "indicator": "Red"},
	]
