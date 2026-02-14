// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Deal', {
	refresh: function(frm) {
		frm.set_query('price_list_area', function() {
			return { filters: { 'is_active': 1 } };
		});
		frm.set_query('item', 'items', function() {
			return { filters: { 'disabled': 0 } };
		});
		frm.set_query('pack_size', 'items', function() {
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
			&& frm.doc.status !== 'Delivered') {
			let has_pending = (frm.doc.items || []).some(function(row) {
				return flt(row.pending_qty) > 0;
			});
			if (has_pending) {
				frm.add_custom_button(__('Create Delivery'), function() {
					frappe.new_doc('Deal Delivery', {
						customer: frm.doc.customer
					});
				});
			}
		}

		// Render delivery status table
		render_delivery_status(frm);

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
		// Re-fetch rates for all existing item rows
		(frm.doc.items || []).forEach(function(row) {
			if (row.item && row.pack_size) {
				fetch_item_rate(frm, row);
			}
		});
	}
});


frappe.ui.form.on('Deal Item', {
	item: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		fetch_item_rate(frm, row);
	},

	pack_size: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		fetch_item_rate(frm, row);
	},

	qty: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		calculate_row_amount(frm, row, cdt, cdn);
	},

	rate: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		calculate_row_amount(frm, row, cdt, cdn);
	}
});


function fetch_item_rate(frm, row) {
	if (!frm.doc.price_list_area || !row.item || !row.pack_size) return;

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_price_list.deal_price_list.get_rate_for_pack_size',
		args: {
			price_list_area: frm.doc.price_list_area,
			item: row.item,
			pack_size: row.pack_size
		},
		callback: function(r) {
			if (r.message) {
				frappe.model.set_value(row.doctype, row.name, {
					'rate': r.message.rate,
					'base_price_50kg': r.message.base_price_50kg,
					'price_per_kg': r.message.price_per_kg,
					'pack_weight_kg': r.message.pack_weight_kg,
					'price_list_ref': r.message.price_list_name
				});
				frappe.show_alert({
					message: __('Row {0}: Rate fetched {1} per pack ({2} KG)',
						[row.idx, r.message.rate.toFixed(2), r.message.pack_weight_kg]),
					indicator: 'green'
				}, 3);
			} else {
				frappe.show_alert({
					message: __('Row {0}: No price found for this Area + Item', [row.idx]),
					indicator: 'orange'
				}, 4);
			}
		}
	});
}


function calculate_row_amount(frm, row, cdt, cdn) {
	let amount = flt(row.qty) * flt(row.rate);
	frappe.model.set_value(cdt, cdn, 'amount', amount);
	frappe.model.set_value(cdt, cdn, 'pending_qty', flt(row.qty) - flt(row.delivered_qty));
	recalculate_deal_totals(frm);
}


function recalculate_deal_totals(frm) {
	let total_qty = 0, total_amount = 0;
	(frm.doc.items || []).forEach(function(row) {
		total_qty += flt(row.qty);
		total_amount += flt(row.amount);
	});
	frm.set_value('total_qty', total_qty);
	frm.set_value('total_amount', total_amount);
}


function render_delivery_status(frm) {
	let wrapper = frm.fields_dict.delivery_status_html.$wrapper;
	wrapper.empty();

	if (frm.is_new() || !frm.doc.items || frm.doc.items.length === 0) return;

	let has_delivery = (frm.doc.items || []).some(function(row) {
		return flt(row.delivered_qty) > 0;
	});

	if (!has_delivery) {
		wrapper.html('<div class="text-muted text-center" style="padding: 15px;">No deliveries yet</div>');
		return;
	}

	let html = '<table class="table table-bordered table-sm" style="margin-bottom: 0;">';
	html += '<thead style="background: #f7f7f7;"><tr>';
	html += '<th>#</th><th>Item</th><th>Pack Size</th>';
	html += '<th class="text-right">Booked</th>';
	html += '<th class="text-right">Delivered</th>';
	html += '<th class="text-right">Pending</th>';
	html += '<th>Status</th>';
	html += '</tr></thead><tbody>';

	let total_booked = 0, total_delivered = 0, total_pending = 0;

	(frm.doc.items || []).forEach(function(row, i) {
		let delivered = flt(row.delivered_qty);
		let pending = flt(row.pending_qty);
		let status = row.item_status || 'Open';
		let indicator = status === 'Delivered' ? 'green'
			: status === 'Partially Delivered' ? 'orange' : 'blue';

		total_booked += flt(row.qty);
		total_delivered += delivered;
		total_pending += pending;

		html += '<tr>';
		html += '<td>' + (i + 1) + '</td>';
		html += '<td>' + (row.item_name || row.item) + '</td>';
		html += '<td>' + (row.pack_size || '') + '</td>';
		html += '<td class="text-right">' + flt(row.qty) + '</td>';
		html += '<td class="text-right">' + delivered + '</td>';
		html += '<td class="text-right">' + pending + '</td>';
		html += '<td><span class="indicator-pill ' + indicator + '">' + status + '</span></td>';
		html += '</tr>';
	});

	html += '</tbody><tfoot style="background: #f7f7f7; font-weight: bold;"><tr>';
	html += '<td colspan="3">Total</td>';
	html += '<td class="text-right">' + total_booked + '</td>';
	html += '<td class="text-right">' + total_delivered + '</td>';
	html += '<td class="text-right">' + total_pending + '</td>';
	html += '<td></td>';
	html += '</tr></tfoot></table>';

	wrapper.html(html);
}


function flt(value) {
	if (value === null || value === undefined || value === '') return 0;
	let num = parseFloat(value);
	return isNaN(num) ? 0 : num;
}
