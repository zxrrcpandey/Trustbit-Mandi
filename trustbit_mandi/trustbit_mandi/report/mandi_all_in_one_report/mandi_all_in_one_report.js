// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.query_reports["Mandi All In One Report"] = {
	"filters": [
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			"reqd": 1
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname": "as_flag",
			"label": __("A/S Flag"),
			"fieldtype": "Select",
			"options": "\nA\nS"
		},
		{
			"fieldname": "payment_status",
			"label": __("Payment Status"),
			"fieldtype": "Select",
			"options": "\nPaid\nPending\nPartial\nCancelled"
		},
		{
			"fieldname": "payment_mode",
			"label": __("Payment Mode"),
			"fieldtype": "Select",
			"options": "\nCash\nBank Transfer\nCheque\nUPI\nNEFT\nRTGS"
		},
		{
			"fieldname": "gsm",
			"label": __("Commodity (GSM)"),
			"fieldtype": "Select",
			"options": "\nगेहूं\nचावल\nमक्का/भुट्टा\nजौ\nबाजरा वर्ग\nबाजरा\nमूंग"
		},
		{
			"fieldname": "farmer_name",
			"label": __("Farmer Name"),
			"fieldtype": "Data"
		}
	],

	onload: function(report) {
		// PDF Print button
		report.page.add_inner_button(__("Print PDF"), function() {
			print_report_pdf(report, "Mandi All In One Report");
		});

		// Add RTGS Excel Export button
		report.page.add_inner_button(__("NEFT/RTGS Excel (Bank)"), function() {
			let filters = report.get_values();
			open_url_post(
				'/api/method/trustbit_mandi.trustbit_mandi.report.mandi_all_in_one_report.mandi_all_in_one_report.export_neft_rtgs_excel',
				filters
			);
		}, __("Export"));

		// Add DTR Excel Export button
		report.page.add_inner_button(__("DTR Excel (Bank)"), function() {
			let filters = report.get_values();
			open_url_post(
				'/api/method/trustbit_mandi.trustbit_mandi.report.mandi_all_in_one_report.mandi_all_in_one_report.export_dtr_excel',
				filters
			);
		}, __("Export"));

		// Add Krishi Upaj Mandi Export button
		report.page.add_inner_button(__("Krishi Upaj Mandi (A)"), function() {
			let filters = report.get_values();
			filters.as_flag = "A";
			open_url_post(
				'/api/method/trustbit_mandi.trustbit_mandi.report.mandi_all_in_one_report.mandi_all_in_one_report.export_krishi_upaj_excel',
				filters
			);
		}, __("Krishi Export"));

		report.page.add_inner_button(__("Krishi Upaj Mandi (S)"), function() {
			let filters = report.get_values();
			filters.as_flag = "S";
			open_url_post(
				'/api/method/trustbit_mandi.trustbit_mandi.report.mandi_all_in_one_report.mandi_all_in_one_report.export_krishi_upaj_excel',
				filters
			);
		}, __("Krishi Export"));

		// Add Bulk RTGS Print button
		report.page.add_inner_button(__("Bulk RTGS Forms"), function() {
			let filters = report.get_values();
			frappe.call({
				method: 'trustbit_mandi.trustbit_mandi.report.mandi_all_in_one_report.mandi_all_in_one_report.get_rtgs_entries',
				args: filters,
				callback: function(r) {
					if (r.message && r.message.length > 0) {
						print_rtgs_forms(r.message);
					} else {
						frappe.msgprint(__('No RTGS entries found for the selected filters.'));
					}
				}
			});
		}, __("Print"));
	}
};

function print_rtgs_forms(entries) {
	let html = '';
	entries.forEach(function(entry, idx) {
		html += get_rtgs_form_html(entry, idx);
	});

	let w = window.open();
	w.document.write('<html><head><title>RTGS Forms</title>');
	w.document.write('<style>');
	w.document.write('body { font-family: Arial, sans-serif; font-size: 13px; }');
	w.document.write('.rtgs-form { page-break-after: always; padding: 20px; border: 1px solid #000; margin: 10px; }');
	w.document.write('.rtgs-form:last-child { page-break-after: avoid; }');
	w.document.write('table { width: 100%; border-collapse: collapse; margin-top: 10px; }');
	w.document.write('table td, table th { border: 1px solid #333; padding: 8px; text-align: left; }');
	w.document.write('table th { background: #f0f0f0; font-weight: bold; }');
	w.document.write('.header { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }');
	w.document.write('.amount-words { font-style: italic; margin-top: 8px; }');
	w.document.write('@media print { .rtgs-form { border: none; margin: 0; } }');
	w.document.write('</style></head><body>');
	w.document.write(html);
	w.document.write('</body></html>');
	w.document.close();
	setTimeout(function() { w.print(); }, 500);
}

function get_rtgs_form_html(entry, idx) {
	return `
		<div class="rtgs-form">
			<div class="header">RTGS / NEFT TRANSFER REQUEST FORM</div>
			<table>
				<tr><th width="35%">S.No.</th><td>${idx + 1}</td></tr>
				<tr><th>Date</th><td>${entry.pay_date || entry.contract_date || ''}</td></tr>
				<tr><th>Contract No.</th><td>${entry.contract_number || ''}</td></tr>
				<tr><th>Farmer Name</th><td>${entry.farmer_name || ''}</td></tr>
				<tr><th>Address</th><td>${entry.address || ''}</td></tr>
				<tr><th>Phone</th><td>${entry.phone_number || ''}</td></tr>
				<tr><th>Commodity</th><td>${entry.gsm || ''}</td></tr>
				<tr><th>Weight (Qtl)</th><td>${entry.actual_weight || ''}</td></tr>
				<tr><th>Amount</th><td>${format_currency(entry.net_amount)}</td></tr>
				<tr><th>Bank Name</th><td>${entry.bank_name || ''}</td></tr>
				<tr><th>Account Number</th><td>${entry.account_number || ''}</td></tr>
				<tr><th>IFSC Code</th><td>${entry.ifsc_code || ''}</td></tr>
				<tr><th>Branch</th><td>${entry.branch || ''}</td></tr>
				<tr><th>Payment Mode</th><td>${entry.payment_mode || 'RTGS'}</td></tr>
			</table>
			<br>
			<table>
				<tr><th width="50%">Authorized Signatory</th><th>Receiver Signature</th></tr>
				<tr><td style="height: 60px;"></td><td></td></tr>
			</table>
		</div>
	`;
}

function format_currency(val) {
	if (!val) return '0.00';
	return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

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
