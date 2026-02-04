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
		{"fieldname": "farmer_name", "label": _("Farmer Name"), "fieldtype": "Data", "width": 150},
		{"fieldname": "address", "label": _("Address"), "fieldtype": "Data", "width": 120},
		{"fieldname": "phone_number", "label": _("Phone"), "fieldtype": "Data", "width": 100},
		{"fieldname": "contract_date", "label": _("Contract Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "contract_number", "label": _("Contract No."), "fieldtype": "Data", "width": 120},
		{"fieldname": "expected_bag", "label": _("Exp. Bag"), "fieldtype": "Int", "width": 70},
		{"fieldname": "transaction_no", "label": _("Transaction No."), "fieldtype": "Data", "width": 140},
		{"fieldname": "actual_bag", "label": _("Actual Bag"), "fieldtype": "Float", "width": 80},
		{"fieldname": "actual_weight", "label": _("Actual Weight"), "fieldtype": "Float", "width": 100},
		{"fieldname": "auction_rate", "label": _("Rate"), "fieldtype": "Currency", "width": 80},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 120}
	]


def get_data(filters):
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	farmer_name = filters.get("farmer_name")

	conditions = ["docstatus < 2", "contract_date >= %s", "contract_date <= %s"]
	values = [from_date, to_date]

	if farmer_name:
		conditions.append("farmer_name LIKE %s")
		values.append("%" + farmer_name + "%")

	sql = """
		SELECT
			farmer_name,
			address,
			phone_number,
			contract_date,
			contract_number,
			expected_bag,
			transaction_no,
			actual_bag,
			actual_weight,
			auction_rate,
			amount
		FROM `tabGrain Purchase`
		WHERE {conditions}
		ORDER BY contract_date DESC, farmer_name ASC
	""".format(conditions=" AND ".join(conditions))

	rows = frappe.db.sql(sql, values, as_dict=True)

	# Add serial numbers
	sno = 0
	for row in rows:
		sno += 1
		row["sno"] = sno

	# Add total row
	if rows:
		total_exp = sum([(r.get("expected_bag") or 0) for r in rows])
		total_bag = sum([(r.get("actual_bag") or 0) for r in rows])
		total_wt = sum([(r.get("actual_weight") or 0) for r in rows])
		total_amt = sum([(r.get("amount") or 0) for r in rows])

		rows.append({
			"sno": "",
			"farmer_name": "<b>TOTAL</b>",
			"expected_bag": total_exp,
			"actual_bag": total_bag,
			"actual_weight": total_wt,
			"amount": total_amt
		})

	return rows
