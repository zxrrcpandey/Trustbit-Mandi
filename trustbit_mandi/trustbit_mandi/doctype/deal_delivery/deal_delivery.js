// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Deal Delivery', {
	refresh: function(frm) {
		frm.set_query('item', function() {
			return { filters: { 'disabled': 0 } };
		});
		frm.set_query('pack_size', function() {
			return { filters: { 'is_active': 1 } };
		});

		// Auto-Allocate FIFO button
		if (frm.doc.customer && frm.doc.item && frm.doc.pack_size
			&& flt(frm.doc.total_delivery_qty) > 0) {
			frm.add_custom_button(__('Auto-Allocate FIFO'), function() {
				allocate_fifo(frm);
			}).addClass('btn-primary');
		}

		// Fetch Pending Deals button
		if (frm.doc.customer && frm.doc.item && frm.doc.pack_size) {
			frm.add_custom_button(__('Fetch Pending Deals'), function() {
				fetch_pending_deals(frm);
			});
		}
	},

	customer: function(frm) {
		clear_items_if_changed(frm);
	},

	item: function(frm) {
		clear_items_if_changed(frm);
	},

	pack_size: function(frm) {
		clear_items_if_changed(frm);
	},

	total_delivery_qty: function(frm) {
		if (frm.doc.customer && frm.doc.item && frm.doc.pack_size
			&& flt(frm.doc.total_delivery_qty) > 0) {
			allocate_fifo(frm);
		}
	}
});


frappe.ui.form.on('Deal Delivery Item', {
	deliver_qty: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, 'amount', flt(row.deliver_qty) * flt(row.rate));
		recalculate_totals(frm);
	}
});


function allocate_fifo(frm) {
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.allocate_fifo',
		args: {
			customer: frm.doc.customer,
			item: frm.doc.item,
			pack_size: frm.doc.pack_size,
			total_qty: frm.doc.total_delivery_qty,
			exclude_delivery: frm.doc.name || null
		},
		callback: function(r) {
			if (r.message && r.message.length > 0) {
				frm.clear_table('items');

				r.message.forEach(function(alloc) {
					let row = frm.add_child('items');
					row.soda = alloc.soda;
					row.customer = alloc.customer;
					row.item = alloc.item;
					row.pack_size = alloc.pack_size;
					row.soda_qty = alloc.soda_qty;
					row.already_delivered = alloc.already_delivered;
					row.pending_qty = alloc.pending_qty;
					row.deliver_qty = alloc.deliver_qty;
					row.rate = alloc.rate;
					row.amount = alloc.amount;
				});

				frm.refresh_field('items');
				recalculate_totals(frm);

				frappe.show_alert({
					message: __('FIFO allocation complete: {0} Deals allocated', [r.message.length]),
					indicator: 'green'
				}, 3);
			} else {
				frappe.show_alert({
					message: __('No pending Deals found for this Customer + Item + Pack Size'),
					indicator: 'orange'
				}, 4);
			}
		}
	});
}


function fetch_pending_deals(frm) {
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deals',
		args: {
			customer: frm.doc.customer,
			item: frm.doc.item,
			pack_size: frm.doc.pack_size,
			exclude_delivery: frm.doc.name || null
		},
		callback: function(r) {
			if (r.message && r.message.length > 0) {
				let msg = '<table class="table table-bordered table-sm">';
				msg += '<tr><th>Deal</th><th>Date</th><th>Qty</th><th>Delivered</th><th>Pending</th><th>Rate</th></tr>';
				r.message.forEach(function(s) {
					msg += '<tr>';
					msg += '<td>' + s.name + '</td>';
					msg += '<td>' + s.soda_date + '</td>';
					msg += '<td>' + s.qty + '</td>';
					msg += '<td>' + s.already_delivered + '</td>';
					msg += '<td>' + s.pending_qty + '</td>';
					msg += '<td>' + format_number(s.rate) + '</td>';
					msg += '</tr>';
				});
				msg += '</table>';
				frappe.msgprint({
					title: __('Pending Deals (FIFO Order)'),
					message: msg,
					indicator: 'blue'
				});
			} else {
				frappe.msgprint(__('No pending Deals found.'));
			}
		}
	});
}


function clear_items_if_changed(frm) {
	if (frm.doc.items && frm.doc.items.length > 0) {
		frm.clear_table('items');
		frm.refresh_field('items');
	}
}


function recalculate_totals(frm) {
	let total_qty = 0, total_amount = 0;
	(frm.doc.items || []).forEach(function(row) {
		total_qty += flt(row.deliver_qty);
		total_amount += flt(row.amount);
	});
	frm.set_value('total_delivery_qty', total_qty);
	frm.set_value('total_amount', total_amount);
}


function flt(value) {
	if (value === null || value === undefined || value === '') return 0;
	let num = parseFloat(value);
	return isNaN(num) ? 0 : num;
}


function format_number(num) {
	if (!num) return '0.00';
	return new Intl.NumberFormat('en-IN', {
		minimumFractionDigits: 2, maximumFractionDigits: 2
	}).format(num);
}
