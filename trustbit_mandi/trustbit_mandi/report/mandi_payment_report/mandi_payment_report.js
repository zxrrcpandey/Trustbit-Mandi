// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.query_reports["Mandi Payment Report"] = {
	"filters": [
		{
			"fieldname": "from_date",
			"label": __("Payment Date From"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1)
		},
		{
			"fieldname": "to_date",
			"label": __("Payment Date To"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today()
		},
		{
			"fieldname": "payment_status",
			"label": __("Payment Status"),
			"fieldtype": "Select",
			"options": "\nPaid\nPending\nPartial"
		},
		{
			"fieldname": "payment_mode",
			"label": __("Payment Mode"),
			"fieldtype": "Select",
			"options": "\nCash\nCheque\nRTGS\nNEFT\nBank Transfer"
		},
		{
			"fieldname": "gsm",
			"label": __("GSM (Commodity)"),
			"fieldtype": "Data"
		}
	]
};
