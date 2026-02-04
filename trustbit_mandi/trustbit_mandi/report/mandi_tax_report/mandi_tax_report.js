// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.query_reports["Mandi Tax Report"] = {
	"filters": [
		{
			"fieldname": "period",
			"label": __("Period"),
			"fieldtype": "Select",
			"options": "\nMonthly\nQuarterly\nHalf-Yearly\nYearly"
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -3)
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today()
		},
		{
			"fieldname": "tax_deposit_for",
			"label": __("Tax Deposit For"),
			"fieldtype": "Select",
			"options": "\nMandi\nChaupal"
		},
		{
			"fieldname": "tax_type",
			"label": __("Tax Type"),
			"fieldtype": "Select",
			"options": "\nMandi Tax\nNirashrit Tax"
		}
	]
};
