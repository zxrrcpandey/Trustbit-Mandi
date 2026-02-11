// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Soda Price List', {
	refresh: function(frm) {
		frm.set_query('price_list_area', function() {
			return { filters: { 'is_active': 1 } };
		});
		frm.set_query('item', function() {
			return { filters: { 'disabled': 0 } };
		});
	},

	base_price_50kg: function(frm) {
		let base = flt(frm.doc.base_price_50kg);
		if (base > 0) {
			frm.set_value('price_per_kg', base / 50);
		} else {
			frm.set_value('price_per_kg', 0);
		}
	}
});

function flt(value) {
	if (value === null || value === undefined || value === '') return 0;
	let num = parseFloat(value);
	return isNaN(num) ? 0 : num;
}
