// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.query_reports["Soda Price List Ledger"] = {
	onload: function(report) {
		report.page.add_inner_button(__("Print PDF"), function() {
			print_report_pdf(report, "Soda Price List Ledger");
		});
	},
	"filters": [
		{
			"fieldname": "price_list_area",
			"label": __("Price List Area"),
			"fieldtype": "Link",
			"options": "Soda Price List Area"
		},
		{
			"fieldname": "item",
			"label": __("Item"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname": "item_group",
			"label": __("Item Group"),
			"fieldtype": "Link",
			"options": "Item Group"
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1)
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today()
		}
	]
};

function print_report_pdf(report, title) {
	let filters = report.get_values();
	let filter_text = [];
	if (filters.from_date) filter_text.push("From: " + filters.from_date);
	if (filters.to_date) filter_text.push("To: " + filters.to_date);
	Object.keys(filters).forEach(function(k) {
		if (k !== "from_date" && k !== "to_date" && filters[k]) {
			filter_text.push(k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + ": " + filters[k]);
		}
	});

	let data_table = document.querySelector(".dt-scrollable") || document.querySelector(".datatable");
	if (!data_table) {
		frappe.msgprint(__("No report data to print. Please run the report first."));
		return;
	}
	let table_html = data_table.querySelector("table")
		? data_table.querySelector("table").outerHTML
		: data_table.innerHTML;

	let w = window.open();
	w.document.write('<html><head><title>' + title + '</title>');
	w.document.write('<style>');
	w.document.write('@page { size: A4 landscape; margin: 8mm; }');
	w.document.write('body { font-family: Arial, sans-serif; font-size: 11px; }');
	w.document.write('.header { text-align: center; margin-bottom: 10px; }');
	w.document.write('.header h2 { margin: 0; font-size: 16px; }');
	w.document.write('.header p { margin: 3px 0; font-size: 11px; color: #555; }');
	w.document.write('table { width: 100%; border-collapse: collapse; }');
	w.document.write('th, td { border: 1px solid #333; padding: 4px 6px; font-size: 10px; }');
	w.document.write('th { background: #e5e5e5; font-weight: bold; }');
	w.document.write('td { text-align: right; }');
	w.document.write('td:first-child, td:nth-child(2), td:nth-child(3) { text-align: left; }');
	w.document.write('.footer { margin-top: 10px; font-size: 9px; color: #888; text-align: right; }');
	w.document.write('</style></head><body>');
	w.document.write('<div class="header">');
	w.document.write('<h2>' + title + '</h2>');
	if (filter_text.length) w.document.write('<p>' + filter_text.join(" | ") + '</p>');
	w.document.write('</div>');
	w.document.write(table_html);
	w.document.write('<div class="footer">Printed on: ' + frappe.datetime.now_datetime() + '</div>');
	w.document.write('</body></html>');
	w.document.close();
	setTimeout(function() { w.print(); }, 500);
}
