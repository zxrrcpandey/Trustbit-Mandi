// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Deal', {
	refresh: function(frm) {
		frm.set_query('price_list_area', function() {
			return { filters: { 'is_active': 1 } };
		});
		frm.set_query('item', function() {
			return { filters: { 'disabled': 0 } };
		});
		frm.set_query('pack_size', function() {
			return { filters: { 'is_active': 1 } };
		});

		// Confirm button
		if (!frm.is_new() && frm.doc.status === 'Open') {
			frm.add_custom_button(__('Confirm'), function() {
				frm.set_value('status', 'Confirmed');
				frm.save();
			}).addClass('btn-primary');
		}

		// Create Delivery button
		if (!frm.is_new() && frm.doc.status !== 'Cancelled'
			&& frm.doc.status !== 'Delivered' && flt(frm.doc.pending_qty) > 0) {
			frm.add_custom_button(__('Create Delivery'), function() {
				frappe.new_doc('Deal Delivery', {
					customer: frm.doc.customer,
					item: frm.doc.item,
					pack_size: frm.doc.pack_size
				});
			});
		}

		// Cancel button
		if (!frm.is_new() && frm.doc.status !== 'Cancelled'
			&& frm.doc.status !== 'Delivered') {
			frm.add_custom_button(__('Cancel Deal'), function() {
				frappe.confirm(
					__('Are you sure you want to cancel this Deal?'),
					function() {
						frm.set_value('status', 'Cancelled');
						frm.save();
					}
				);
			}, __('Actions'));
		}
	},

	price_list_area: function(frm) {
		fetch_rate(frm);
	},

	item: function(frm) {
		fetch_rate(frm);
	},

	pack_size: function(frm) {
		fetch_rate(frm);
	},

	qty: function(frm) {
		calculate_amount(frm);
	},

	rate: function(frm) {
		calculate_amount(frm);
	}
});


function fetch_rate(frm) {
	if (!frm.doc.price_list_area || !frm.doc.item || !frm.doc.pack_size) return;

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_price_list.deal_price_list.get_rate_for_pack_size',
		args: {
			price_list_area: frm.doc.price_list_area,
			item: frm.doc.item,
			pack_size: frm.doc.pack_size
		},
		callback: function(r) {
			if (r.message) {
				frm.set_value('rate', r.message.rate);
				frm.set_value('base_price_50kg', r.message.base_price_50kg);
				frm.set_value('price_per_kg', r.message.price_per_kg);
				frm.set_value('pack_weight_kg', r.message.pack_weight_kg);
				frm.set_value('price_list_ref', r.message.price_list_name);
				frappe.show_alert({
					message: __('Rate fetched: {0} per pack ({1} KG)',
						[r.message.rate.toFixed(2), r.message.pack_weight_kg]),
					indicator: 'green'
				}, 3);
			} else {
				frappe.show_alert({
					message: __('No price found for this Area + Item combination'),
					indicator: 'orange'
				}, 4);
			}
		}
	});
}


function calculate_amount(frm) {
	let qty = flt(frm.doc.qty);
	let rate = flt(frm.doc.rate);
	frm.set_value('amount', qty * rate);
	frm.set_value('pending_qty', qty - flt(frm.doc.delivered_qty));
}


function flt(value) {
	if (value === null || value === undefined || value === '') return 0;
	let num = parseFloat(value);
	return isNaN(num) ? 0 : num;
}
