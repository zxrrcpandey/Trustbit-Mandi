// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Deal Delivery', {
	refresh: function(frm) {
		// Auto-Allocate FIFO button
		if (frm.doc.customer) {
			frm.add_custom_button(__('Auto-Allocate FIFO'), function() {
				show_fifo_dialog(frm);
			}).addClass('btn-primary');

			frm.add_custom_button(__('Fetch Pending Deals'), function() {
				show_pending_deals_dialog(frm);
			});
		}
	},

	customer: function(frm) {
		clear_items_if_changed(frm);
	}
});


frappe.ui.form.on('Deal Delivery Item', {
	deliver_qty: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, 'amount', flt(row.deliver_qty) * flt(row.rate));
		recalculate_totals(frm);
	}
});


function show_fifo_dialog(frm) {
	let d = new frappe.ui.Dialog({
		title: __('FIFO Allocation'),
		fields: [
			{
				fieldname: 'item',
				fieldtype: 'Link',
				label: __('Item (optional)'),
				options: 'Item',
				description: 'Leave blank to allocate across all items'
			},
			{
				fieldname: 'pack_size',
				fieldtype: 'Link',
				label: __('Pack Size (optional)'),
				options: 'Deal Pack Size'
			},
			{
				fieldname: 'total_qty',
				fieldtype: 'Float',
				label: __('Total Delivery Qty (Packs)'),
				reqd: 1
			}
		],
		primary_action_label: __('Allocate'),
		primary_action: function(values) {
			frappe.call({
				method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.allocate_fifo',
				args: {
					customer: frm.doc.customer,
					total_qty: values.total_qty,
					item: values.item || null,
					pack_size: values.pack_size || null,
					exclude_delivery: frm.doc.name || null
				},
				callback: function(r) {
					if (r.message && r.message.length > 0) {
						frm.clear_table('items');

						r.message.forEach(function(alloc) {
							let row = frm.add_child('items');
							row.soda = alloc.soda;
							row.deal_item = alloc.deal_item;
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
							message: __('FIFO allocation complete: {0} rows allocated', [r.message.length]),
							indicator: 'green'
						}, 3);
					} else {
						frappe.show_alert({
							message: __('No pending Deal Items found'),
							indicator: 'orange'
						}, 4);
					}
					d.hide();
				}
			});
		}
	});
	d.show();
}


function show_pending_deals_dialog(frm) {
	let d = new frappe.ui.Dialog({
		title: __('View Pending Deals'),
		fields: [
			{
				fieldname: 'item',
				fieldtype: 'Link',
				label: __('Item (optional)'),
				options: 'Item'
			},
			{
				fieldname: 'pack_size',
				fieldtype: 'Link',
				label: __('Pack Size (optional)'),
				options: 'Deal Pack Size'
			}
		],
		primary_action_label: __('Fetch'),
		primary_action: function(values) {
			frappe.call({
				method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deal_items',
				args: {
					customer: frm.doc.customer,
					item: values.item || null,
					pack_size: values.pack_size || null,
					exclude_delivery: frm.doc.name || null
				},
				callback: function(r) {
					d.hide();
					if (r.message && r.message.length > 0) {
						let msg = '<table class="table table-bordered table-sm">';
						msg += '<tr><th>Deal</th><th>Date</th><th>Item</th>';
						msg += '<th>Pack</th><th>Qty</th><th>Delivered</th>';
						msg += '<th>Pending</th><th>Rate</th></tr>';
						r.message.forEach(function(s) {
							msg += '<tr>';
							msg += '<td>' + s.deal_name + '</td>';
							msg += '<td>' + s.soda_date + '</td>';
							msg += '<td>' + (s.item_name || s.item) + '</td>';
							msg += '<td>' + s.pack_size + '</td>';
							msg += '<td>' + s.qty + '</td>';
							msg += '<td>' + s.already_delivered + '</td>';
							msg += '<td>' + s.pending_qty + '</td>';
							msg += '<td>' + format_number(s.rate) + '</td>';
							msg += '</tr>';
						});
						msg += '</table>';
						frappe.msgprint({
							title: __('Pending Deal Items (FIFO Order)'),
							message: msg,
							indicator: 'blue'
						});
					} else {
						frappe.msgprint(__('No pending Deal Items found.'));
					}
				}
			});
		}
	});
	d.show();
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
