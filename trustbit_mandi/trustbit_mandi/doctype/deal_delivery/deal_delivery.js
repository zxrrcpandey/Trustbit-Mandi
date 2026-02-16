// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Deal Delivery', {
	refresh: function(frm) {
		// Get Items button (always show, validate customer on click)
		frm.add_custom_button(__('Get Items'), function() {
			if (!frm.doc.customer) {
				frappe.msgprint(__('Please select a Customer first.'));
				return;
			}
			show_get_items_dialog(frm);
		}).addClass('btn-primary');

		// Render pending summary
		render_pending_summary(frm);
	},

	customer: function(frm) {
		clear_items_if_changed(frm);
		render_pending_summary(frm);
	}
});


frappe.ui.form.on('Deal Delivery Item', {
	deliver_qty: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, 'amount', flt(row.deliver_qty) * flt(row.rate));
		recalculate_totals(frm);
	}
});


// ============================================================
// Pending Summary (auto-loads on form)
// ============================================================

function render_pending_summary(frm) {
	let wrapper = frm.fields_dict.pending_summary_html;
	if (!wrapper) return;
	wrapper = wrapper.$wrapper;
	wrapper.empty();

	if (!frm.doc.customer) {
		wrapper.html('<div class="text-muted text-center" style="padding:15px;">Select a customer to see pending deals</div>');
		return;
	}

	wrapper.html('<div class="text-muted text-center" style="padding:15px;">Loading...</div>');

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deal_items',
		args: {
			customer: frm.doc.customer,
			exclude_delivery: frm.doc.name || null
		},
		callback: function(r) {
			if (!r.message || r.message.length === 0) {
				wrapper.html('<div class="text-muted text-center" style="padding:15px;">No pending deals for this customer</div>');
				return;
			}

			let rows = r.message;
			let total_pending = 0;
			let total_amount = 0;

			let html = '<div style="max-height:300px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;">';
			html += '<table class="table table-sm" style="margin-bottom:0;font-size:12.5px;">';
			html += '<thead style="background:#f7fafc;position:sticky;top:0;z-index:1;">';
			html += '<tr>';
			html += '<th style="padding:6px 8px;font-size:11px;">#</th>';
			html += '<th style="padding:6px 8px;font-size:11px;">DEAL</th>';
			html += '<th style="padding:6px 8px;font-size:11px;">DATE</th>';
			html += '<th style="padding:6px 8px;font-size:11px;">ITEM</th>';
			html += '<th style="padding:6px 8px;font-size:11px;">PACK SIZE</th>';
			html += '<th style="text-align:right;padding:6px 8px;font-size:11px;">DEAL QTY</th>';
			html += '<th style="text-align:right;padding:6px 8px;font-size:11px;">DELIVERED</th>';
			html += '<th style="text-align:right;padding:6px 8px;font-size:11px;">PENDING</th>';
			html += '<th style="text-align:right;padding:6px 8px;font-size:11px;">RATE</th>';
			html += '</tr></thead><tbody>';

			rows.forEach(function(s, i) {
				let pending = flt(s.pending_qty);
				total_pending += pending;
				total_amount += pending * flt(s.rate);

				html += '<tr>';
				html += '<td style="padding:5px 8px;color:#718096;">' + (i + 1) + '</td>';
				html += '<td style="padding:5px 8px;"><a href="/app/deal/' + s.deal_name + '" style="font-weight:600;">' + s.deal_name + '</a></td>';
				html += '<td style="padding:5px 8px;color:#718096;">' + frappe.datetime.str_to_user(s.soda_date) + '</td>';
				html += '<td style="padding:5px 8px;font-weight:500;">' + (s.item_name || s.item) + '</td>';
				html += '<td style="padding:5px 8px;">' + s.pack_size + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;">' + flt(s.qty) + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;color:#718096;">' + flt(s.already_delivered) + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;font-weight:600;color:' + (pending > 0 ? '#e53e3e' : '#38a169') + ';">' + pending + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;">' + format_number(s.rate) + '</td>';
				html += '</tr>';
			});

			html += '</tbody>';
			html += '<tfoot style="background:#f7fafc;font-weight:bold;">';
			html += '<tr>';
			html += '<td colspan="7" style="padding:6px 8px;">Total</td>';
			html += '<td style="text-align:right;padding:6px 8px;color:#e53e3e;">' + total_pending + '</td>';
			html += '<td style="text-align:right;padding:6px 8px;">&#8377; ' + format_number(total_amount) + '</td>';
			html += '</tr></tfoot>';
			html += '</table></div>';

			wrapper.html(html);
		}
	});
}


// ============================================================
// Get Items Dialog
// ============================================================

function show_get_items_dialog(frm) {
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deal_items',
		args: {
			customer: frm.doc.customer,
			exclude_delivery: frm.doc.name || null
		},
		freeze: true,
		freeze_message: __('Loading pending deals...'),
		callback: function(r) {
			if (!r.message || r.message.length === 0) {
				frappe.msgprint(__('No pending Deal Items found for this customer.'));
				return;
			}
			build_get_items_dialog(frm, r.message);
		}
	});
}

function build_get_items_dialog(frm, pending_items) {
	// Build row state from pending items
	let rows = [];
	pending_items.forEach(function(p, i) {
		rows.push({
			idx: i,
			deal_name: p.deal_name,
			deal_item_name: p.deal_item_name,
			soda_date: p.soda_date,
			customer_name: p.customer_name,
			item: p.item,
			item_name: p.item_name,
			pack_size: p.pack_size,
			qty: flt(p.qty),
			already_delivered: flt(p.already_delivered),
			pending_qty: flt(p.pending_qty),
			deliver_qty: flt(p.pending_qty),
			rate: flt(p.rate),
			checked: true
		});
	});

	let d = new frappe.ui.Dialog({
		title: __('Get Items for Delivery'),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'dialog_content'
			}
		],
		primary_action_label: __('Add to Delivery'),
		primary_action: function() {
			add_selected_to_delivery(frm, rows, d);
		}
	});

	// Customer badge
	d.$wrapper.find('.modal-title').append(
		' <span style="background:#e8f4fd;color:#1565c0;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500;margin-left:8px;">'
		+ (frm.doc.customer_name || frm.doc.customer) + '</span>'
	);

	let wrapper = d.fields_dict.dialog_content.$wrapper;
	wrapper.css('min-height', '300px');

	function render_table() {
		let html = '';

		// Info bar
		html += '<div style="font-size:11px;color:#718096;padding:6px 10px;margin-bottom:10px;background:#f0fff4;border-left:3px solid #38a169;border-radius:4px;">'
			+ 'All pending items are pre-selected with full pending qty. Untick or adjust <b>Deliver Qty</b> as needed.</div>';

		// Table
		html += '<div style="max-height:380px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;">';
		html += '<table class="table table-sm" style="margin-bottom:0;font-size:12.5px;">';
		html += '<thead style="background:#f7fafc;position:sticky;top:0;z-index:1;">';
		html += '<tr>';
		html += '<th style="width:32px;text-align:center;padding:8px 4px;font-size:11px;">SEL</th>';
		html += '<th style="padding:8px 6px;font-size:11px;">DEAL</th>';
		html += '<th style="padding:8px 6px;font-size:11px;">DATE</th>';
		html += '<th style="padding:8px 6px;font-size:11px;">ITEM</th>';
		html += '<th style="padding:8px 6px;font-size:11px;">PACK SIZE</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">DEAL QTY</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">DELIVERED</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">PENDING</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;width:80px;">DELIVER QTY</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">RATE</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">AMOUNT</th>';
		html += '</tr></thead><tbody>';

		rows.forEach(function(row) {
			let amount = flt(row.deliver_qty) * flt(row.rate);
			let row_bg = row.checked ? 'background:#f0fff4;' : '';

			html += '<tr style="' + row_bg + '" data-idx="' + row.idx + '">';

			// Checkbox
			html += '<td style="text-align:center;vertical-align:middle;padding:6px 4px;">'
				+ '<input type="checkbox" class="row-check" data-idx="' + row.idx + '" '
				+ (row.checked ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;">'
				+ '</td>';

			// Deal
			html += '<td style="vertical-align:middle;padding:6px;font-weight:600;color:#2b6cb0;font-size:12px;">'
				+ row.deal_name + '</td>';

			// Date
			html += '<td style="vertical-align:middle;padding:6px;color:#718096;font-size:12px;">'
				+ frappe.datetime.str_to_user(row.soda_date) + '</td>';

			// Item
			html += '<td style="vertical-align:middle;padding:6px;font-weight:500;">'
				+ (row.item_name || row.item) + '</td>';

			// Pack Size
			html += '<td style="vertical-align:middle;padding:6px;">' + row.pack_size + '</td>';

			// Deal Qty
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;">' + row.qty + '</td>';

			// Already Delivered
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;color:#718096;">'
				+ row.already_delivered + '</td>';

			// Pending
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;font-weight:600;color:#e53e3e;">'
				+ row.pending_qty + '</td>';

			// Deliver Qty (editable)
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;">'
				+ '<input type="number" class="deliver-input" data-idx="' + row.idx + '" '
				+ 'value="' + (row.deliver_qty || '') + '" min="0" max="' + row.pending_qty + '" '
				+ 'style="width:70px;padding:5px 6px;border:1px solid #cbd5e0;border-radius:4px;text-align:right;font-size:12.5px;font-weight:600;">'
				+ '</td>';

			// Rate
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;color:#718096;">'
				+ format_number(row.rate) + '</td>';

			// Amount
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;'
				+ (amount > 0 ? 'font-weight:600;' : 'color:#718096;') + '">'
				+ (amount > 0 ? format_number(amount) : '--') + '</td>';

			html += '</tr>';
		});

		html += '</tbody></table></div>';

		// Footer summary
		let summary = get_dialog_summary(rows);
		html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 0;">';
		html += '<div style="display:flex;gap:24px;font-size:13px;color:#4a5568;">';
		html += '<div>Selected: <strong>' + summary.selected + '</strong> of ' + rows.length + '</div>';
		html += '<div>Total Deliver Qty: <strong>' + summary.total_qty + '</strong></div>';
		html += '<div>Total Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
		html += '</div></div>';

		wrapper.html(html);

		// Bind events
		bind_get_items_events(wrapper, rows, render_table);
	}

	render_table();
	d.show();
	d.$wrapper.find('.modal-dialog').css('max-width', '1100px');
}


function bind_get_items_events(wrapper, rows, render_table) {
	// Checkbox
	wrapper.find('.row-check').off('change').on('change', function() {
		let idx = parseInt($(this).data('idx'));
		let row = rows[idx];
		if (row) {
			row.checked = $(this).is(':checked');
			if (!row.checked) {
				row.deliver_qty = 0;
			} else {
				row.deliver_qty = row.pending_qty;
			}
			render_table();
		}
	});

	// Deliver qty input
	wrapper.find('.deliver-input').off('change').on('change', function() {
		let idx = parseInt($(this).data('idx'));
		let val = parseFloat($(this).val()) || 0;
		let row = rows[idx];
		if (row) {
			if (val > row.pending_qty) {
				val = row.pending_qty;
				$(this).val(val);
				frappe.show_alert({
					message: __('Cannot exceed pending qty ({0})', [row.pending_qty]),
					indicator: 'orange'
				}, 3);
			}
			if (val < 0) val = 0;
			row.deliver_qty = val;
			// Auto-check if qty > 0
			if (val > 0 && !row.checked) {
				row.checked = true;
			}
			render_table();
		}
	});
}


function get_dialog_summary(rows) {
	let selected = 0;
	let total_qty = 0;
	let total_amount = 0;

	rows.forEach(function(row) {
		if (row.checked && row.deliver_qty > 0) {
			selected++;
			total_qty += flt(row.deliver_qty);
			total_amount += flt(row.deliver_qty) * flt(row.rate);
		}
	});

	return {
		selected: selected,
		total_qty: total_qty,
		total_amount: total_amount
	};
}


function add_selected_to_delivery(frm, rows, dialog) {
	let items_to_add = [];

	rows.forEach(function(row) {
		if (!row.checked || !row.deliver_qty || row.deliver_qty <= 0) return;

		items_to_add.push({
			soda: row.deal_name,
			deal_item: row.deal_item_name,
			customer: row.customer_name,
			item: row.item,
			pack_size: row.pack_size,
			soda_qty: row.qty,
			already_delivered: row.already_delivered,
			pending_qty: row.pending_qty,
			deliver_qty: row.deliver_qty,
			rate: row.rate,
			amount: flt(row.deliver_qty) * flt(row.rate)
		});
	});

	if (items_to_add.length === 0) {
		frappe.msgprint(__('No items selected. Please check items and enter delivery qty.'));
		return;
	}

	// Clear existing and add new rows
	frm.clear_table('items');

	items_to_add.forEach(function(item) {
		let child = frm.add_child('items');
		child.soda = item.soda;
		child.deal_item = item.deal_item;
		child.customer = item.customer;
		child.item = item.item;
		child.pack_size = item.pack_size;
		child.soda_qty = item.soda_qty;
		child.already_delivered = item.already_delivered;
		child.pending_qty = item.pending_qty;
		child.deliver_qty = item.deliver_qty;
		child.rate = item.rate;
		child.amount = item.amount;
	});

	frm.refresh_field('items');
	recalculate_totals(frm);
	frm.dirty();

	dialog.hide();
	frappe.show_alert({
		message: __('Added {0} item(s) to delivery', [items_to_add.length]),
		indicator: 'green'
	}, 5);
}


// ============================================================
// Helpers
// ============================================================

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
