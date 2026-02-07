# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate, add_months, nowdate, get_first_day, get_last_day


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	chart = get_chart(data)
	report_summary = get_report_summary(data)
	return columns, data, None, chart, report_summary


def get_columns():
	return [
		{"fieldname": "date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "description", "label": _("Description"), "fieldtype": "Data", "width": 250},
		{"fieldname": "type", "label": _("Type"), "fieldtype": "Data", "width": 100},
		{"fieldname": "reference", "label": _("Reference"), "fieldtype": "Data", "width": 130},
		{"fieldname": "mandi_tax_deducted", "label": _("Mandi Tax Deducted"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "nirashrit_tax_deducted", "label": _("Nirashrit Tax Deducted"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "mandi_tax_paid", "label": _("Mandi Tax Paid"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "nirashrit_tax_paid", "label": _("Nirashrit Tax Paid"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "mandi_tax_balance", "label": _("Mandi Tax Balance"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "nirashrit_tax_balance", "label": _("Nirashrit Tax Balance"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "total_balance", "label": _("Total Balance"), "fieldtype": "Currency", "width": 120},
	]


def get_data(filters):
	from_date, to_date = get_date_range(filters)

	# Get opening balances (all transactions before from_date)
	opening_mandi_paid, opening_nirashrit_paid = get_opening_payments(from_date)
	opening_mandi_deducted, opening_nirashrit_deducted = get_opening_deductions(from_date)

	opening_mandi_balance = opening_mandi_paid - opening_mandi_deducted
	opening_nirashrit_balance = opening_nirashrit_paid - opening_nirashrit_deducted

	data = []

	# Opening Balance Row
	data.append({
		"date": from_date,
		"description": "<b>Opening Balance</b>",
		"type": "Opening",
		"reference": "",
		"mandi_tax_deducted": opening_mandi_deducted,
		"nirashrit_tax_deducted": opening_nirashrit_deducted,
		"mandi_tax_paid": opening_mandi_paid,
		"nirashrit_tax_paid": opening_nirashrit_paid,
		"mandi_tax_balance": opening_mandi_balance,
		"nirashrit_tax_balance": opening_nirashrit_balance,
		"total_balance": opening_mandi_balance + opening_nirashrit_balance,
	})

	# Get all grain purchase tax deductions in period
	grain_purchases = frappe.db.sql("""
		SELECT
			contract_date, name, farmer_name, mandi_tax, nirashrit_tax, gsm
		FROM `tabGrain Purchase`
		WHERE docstatus < 2
			AND contract_date >= %s AND contract_date <= %s
		ORDER BY contract_date ASC, name ASC
	""", (from_date, to_date), as_dict=True)

	# Get all tax payment records in period
	tax_payments = frappe.db.sql("""
		SELECT
			deposit_date, name, tax_type, amount, payment_mode, tax_deposit_for
		FROM `tabTax Payment Record`
		WHERE docstatus < 2
			AND deposit_date >= %s AND deposit_date <= %s
		ORDER BY deposit_date ASC, name ASC
	""", (from_date, to_date), as_dict=True)

	# Merge both into a single timeline, sorted by date
	entries = []

	for gp in grain_purchases:
		entries.append({
			"date": gp.contract_date,
			"type": "Deduction",
			"description": "Purchase: {} ({})".format(gp.farmer_name or "", gp.gsm or ""),
			"reference": gp.name,
			"mandi_tax_deducted": flt(gp.mandi_tax),
			"nirashrit_tax_deducted": flt(gp.nirashrit_tax),
			"mandi_tax_paid": 0,
			"nirashrit_tax_paid": 0,
		})

	for tp in tax_payments:
		mandi_paid = flt(tp.amount) if tp.tax_type == "Mandi Tax" else 0
		nirashrit_paid = flt(tp.amount) if tp.tax_type == "Nirashrit Tax" else 0

		entries.append({
			"date": tp.deposit_date,
			"type": "Payment",
			"description": "Tax Payment: {} - {}".format(tp.tax_type or "", tp.payment_mode or ""),
			"reference": tp.name,
			"mandi_tax_deducted": 0,
			"nirashrit_tax_deducted": 0,
			"mandi_tax_paid": mandi_paid,
			"nirashrit_tax_paid": nirashrit_paid,
		})

	# Sort by date
	entries.sort(key=lambda x: (getdate(x["date"]), 0 if x["type"] == "Payment" else 1))

	# Calculate running balances
	running_mandi = opening_mandi_balance
	running_nirashrit = opening_nirashrit_balance

	for entry in entries:
		running_mandi += flt(entry["mandi_tax_paid"]) - flt(entry["mandi_tax_deducted"])
		running_nirashrit += flt(entry["nirashrit_tax_paid"]) - flt(entry["nirashrit_tax_deducted"])

		entry["mandi_tax_balance"] = running_mandi
		entry["nirashrit_tax_balance"] = running_nirashrit
		entry["total_balance"] = running_mandi + running_nirashrit

		data.append(entry)

	# Closing Balance Row
	data.append({
		"date": to_date,
		"description": "<b>Closing Balance</b>",
		"type": "Closing",
		"reference": "",
		"mandi_tax_deducted": "",
		"nirashrit_tax_deducted": "",
		"mandi_tax_paid": "",
		"nirashrit_tax_paid": "",
		"mandi_tax_balance": running_mandi,
		"nirashrit_tax_balance": running_nirashrit,
		"total_balance": running_mandi + running_nirashrit,
	})

	return data


def get_date_range(filters):
	period = filters.get("period")
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")
	today = nowdate()

	if period == "Monthly":
		from_date = get_first_day(today)
		to_date = get_last_day(today)
	elif period == "Quarterly":
		from_date = add_months(get_first_day(today), -2)
		to_date = get_last_day(today)
	elif period == "Half-Yearly":
		from_date = add_months(today, -6)
		to_date = today
	elif period == "Yearly":
		from_date = add_months(today, -12)
		to_date = today
	else:
		if not from_date:
			from_date = add_months(today, -3)
		if not to_date:
			to_date = today

	return from_date, to_date


def get_opening_payments(from_date):
	"""Get total tax payments before the from_date"""
	result = frappe.db.sql("""
		SELECT
			COALESCE(SUM(CASE WHEN tax_type = 'Mandi Tax' THEN amount ELSE 0 END), 0) as mandi_paid,
			COALESCE(SUM(CASE WHEN tax_type = 'Nirashrit Tax' THEN amount ELSE 0 END), 0) as nirashrit_paid
		FROM `tabTax Payment Record`
		WHERE docstatus < 2 AND deposit_date < %s
	""", (from_date,), as_dict=True)

	if result:
		return flt(result[0].mandi_paid), flt(result[0].nirashrit_paid)
	return 0, 0


def get_opening_deductions(from_date):
	"""Get total tax deductions from grain purchases before the from_date"""
	result = frappe.db.sql("""
		SELECT
			COALESCE(SUM(mandi_tax), 0) as mandi_deducted,
			COALESCE(SUM(nirashrit_tax), 0) as nirashrit_deducted
		FROM `tabGrain Purchase`
		WHERE docstatus < 2 AND contract_date < %s
	""", (from_date,), as_dict=True)

	if result:
		return flt(result[0].mandi_deducted), flt(result[0].nirashrit_deducted)
	return 0, 0


def get_chart(data):
	# Exclude opening/closing rows
	report_data = [r for r in data if r.get("type") not in ("Opening", "Closing")]

	mandi_deducted = sum([flt(r.get("mandi_tax_deducted")) for r in report_data])
	nirashrit_deducted = sum([flt(r.get("nirashrit_tax_deducted")) for r in report_data])
	mandi_paid = sum([flt(r.get("mandi_tax_paid")) for r in report_data])
	nirashrit_paid = sum([flt(r.get("nirashrit_tax_paid")) for r in report_data])

	return {
		"data": {
			"labels": ["Mandi Tax", "Nirashrit Tax"],
			"datasets": [
				{
					"name": "Tax Deducted",
					"values": [mandi_deducted, nirashrit_deducted]
				},
				{
					"name": "Tax Paid",
					"values": [mandi_paid, nirashrit_paid]
				}
			]
		},
		"type": "bar",
		"colors": ["#ff5858", "#5e64ff"]
	}


def get_report_summary(data):
	# Get closing balance (last row)
	closing = data[-1] if data else {}
	report_data = [r for r in data if r.get("type") not in ("Opening", "Closing")]

	total_mandi_deducted = sum([flt(r.get("mandi_tax_deducted")) for r in report_data])
	total_nirashrit_deducted = sum([flt(r.get("nirashrit_tax_deducted")) for r in report_data])
	total_mandi_paid = sum([flt(r.get("mandi_tax_paid")) for r in report_data])
	total_nirashrit_paid = sum([flt(r.get("nirashrit_tax_paid")) for r in report_data])

	mandi_balance = flt(closing.get("mandi_tax_balance"))
	nirashrit_balance = flt(closing.get("nirashrit_tax_balance"))
	total_balance = flt(closing.get("total_balance"))

	return [
		{"value": total_mandi_deducted + total_nirashrit_deducted, "label": _("Total Tax Deducted"), "datatype": "Currency", "indicator": "Red"},
		{"value": total_mandi_paid + total_nirashrit_paid, "label": _("Total Tax Paid"), "datatype": "Currency", "indicator": "Green"},
		{"value": mandi_balance, "label": _("Mandi Tax Balance"), "datatype": "Currency", "indicator": "Blue" if mandi_balance >= 0 else "Red"},
		{"value": nirashrit_balance, "label": _("Nirashrit Tax Balance"), "datatype": "Currency", "indicator": "Blue" if nirashrit_balance >= 0 else "Red"},
		{"value": total_balance, "label": _("Net Balance"), "datatype": "Currency", "indicator": "Green" if total_balance >= 0 else "Red"},
	]
