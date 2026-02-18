// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Deal Delivery', {
	refresh: function(frm) {
		// Get Items button
		frm.add_custom_button(__('Get Items'), function() {
			if (!frm.doc.customer) {
				frappe.msgprint(__('Please select a Customer first.'));
				return;
			}
			show_get_items_dialog(frm);
		}).addClass('btn-primary');

		// Add Extra Item button
		frm.add_custom_button(__('Add Extra Item'), function() {
			show_add_extra_dialog(frm);
		});

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
	},

	rate: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, 'amount', flt(row.deliver_qty) * flt(row.rate));
		recalculate_totals(frm);
	},

	pack_size: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.pack_size) {
			frappe.db.get_value('Deal Pack Size', row.pack_size, 'weight_kg', function(r) {
				if (r) {
					frappe.model.set_value(cdt, cdn, 'pack_weight_kg', flt(r.weight_kg));
				}
			});
			// Fetch bag cost from Package Bag Master
			if (row.item) {
				frappe.db.get_value('Package Bag Master', {item: row.item, pack_size: row.pack_size, is_active: 1}, 'bag_cost', function(r) {
					frappe.model.set_value(cdt, cdn, 'bag_cost', r ? flt(r.bag_cost) : 0);
				});
			}
		}
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
			let total_deal_qty = 0, total_delivered = 0, total_pending = 0;
			let total_booked_qtl = 0, total_delivered_qtl = 0, total_pending_qtl = 0;
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
			html += '<th style="text-align:right;padding:6px 8px;font-size:11px;">PENDING QTL</th>';
			html += '<th style="text-align:right;padding:6px 8px;font-size:11px;">RATE</th>';
			html += '</tr></thead><tbody>';

			rows.forEach(function(s, i) {
				let deal_qty = flt(s.qty);
				let delivered = flt(s.already_delivered);
				let pending = flt(s.pending_qty);
				let wt = flt(s.pack_weight_kg);
				let pending_qtl = flt(s.pending_quintal);

				total_deal_qty += deal_qty;
				total_delivered += delivered;
				total_pending += pending;
				total_booked_qtl += flt(s.booked_quintal);
				total_delivered_qtl += flt(s.delivered_quintal);
				total_pending_qtl += pending_qtl;
				total_amount += pending * flt(s.rate);

				html += '<tr>';
				html += '<td style="padding:5px 8px;color:#718096;">' + (i + 1) + '</td>';
				html += '<td style="padding:5px 8px;"><a href="/app/deal/' + s.deal_name + '" style="font-weight:600;">' + s.deal_name + '</a></td>';
				html += '<td style="padding:5px 8px;color:#718096;">' + frappe.datetime.str_to_user(s.soda_date) + '</td>';
				html += '<td style="padding:5px 8px;font-weight:500;">' + (s.item_name || s.item) + '</td>';
				html += '<td style="padding:5px 8px;">' + s.pack_size + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;">' + deal_qty + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;color:#718096;">' + delivered + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;font-weight:600;color:' + (pending > 0 ? '#e53e3e' : '#38a169') + ';">' + pending + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;font-weight:600;color:#805ad5;">' + pending_qtl.toFixed(2) + '</td>';
				html += '<td style="text-align:right;padding:5px 8px;">' + format_number(s.rate) + '</td>';
				html += '</tr>';
			});

			html += '</tbody>';
			html += '<tfoot style="background:#f7fafc;font-weight:bold;">';
			html += '<tr>';
			html += '<td colspan="5" style="padding:6px 8px;">Total (Packs)</td>';
			html += '<td style="text-align:right;padding:6px 8px;">' + total_deal_qty + '</td>';
			html += '<td style="text-align:right;padding:6px 8px;">' + total_delivered + '</td>';
			html += '<td style="text-align:right;padding:6px 8px;color:#e53e3e;">' + total_pending + '</td>';
			html += '<td></td>';
			html += '<td style="text-align:right;padding:6px 8px;">&#8377; ' + format_number(total_amount) + '</td>';
			html += '</tr>';
			html += '<tr style="background:#edf2f7;">';
			html += '<td colspan="5" style="padding:6px 8px;">Total (Quintal)</td>';
			html += '<td style="text-align:right;padding:6px 8px;">' + total_booked_qtl.toFixed(2) + '</td>';
			html += '<td style="text-align:right;padding:6px 8px;">' + total_delivered_qtl.toFixed(2) + '</td>';
			html += '<td style="text-align:right;padding:6px 8px;color:#e53e3e;">' + total_pending_qtl.toFixed(2) + '</td>';
			html += '<td></td><td></td>';
			html += '</tr></tfoot>';
			html += '</table></div>';

			wrapper.html(html);
		}
	});
}


// ============================================================
// Get Items Dialog (with flexible pack size)
// ============================================================

function show_get_items_dialog(frm) {
	// Fetch pending items, pack sizes, and bag costs in parallel
	let pending_items = null;
	let pack_sizes = null;
	let bag_cost_map = {};
	let calls_done = 0;
	let total_calls = 3;

	function check_ready() {
		calls_done++;
		if (calls_done >= total_calls) {
			if (!pending_items || pending_items.length === 0) {
				frappe.msgprint(__('No pending Deal Items found for this customer.'));
				return;
			}
			build_get_items_dialog(frm, pending_items, pack_sizes, bag_cost_map);
		}
	}

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deal_items',
		args: { customer: frm.doc.customer, exclude_delivery: frm.doc.name || null },
		freeze: true,
		freeze_message: __('Loading pending deals...'),
		callback: function(r) { pending_items = r.message || []; check_ready(); }
	});

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pack_sizes',
		callback: function(r) { pack_sizes = r.message || []; check_ready(); }
	});

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_bag_cost_map',
		callback: function(r) { bag_cost_map = r.message || {}; check_ready(); }
	});
}

function build_get_items_dialog(frm, pending_items, pack_sizes, bag_cost_map) {
	// Build pack_weight_map for quick lookup
	let pack_weight_map = {};
	pack_sizes.forEach(function(ps) {
		pack_weight_map[ps.pack_size] = flt(ps.weight_kg);
	});

	// Build pack size dropdown options HTML
	let pack_options_html = '<option value="">--</option>';
	pack_sizes.forEach(function(ps) {
		pack_options_html += '<option value="' + ps.pack_size + '">' + ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
	});

	// Build row state from pending items
	let rows = [];
	pending_items.forEach(function(p, i) {
		let bc = flt(bag_cost_map[p.item + ':' + p.pack_size]);

		// Derive price_per_kg from rate if not stored
		let ppk = flt(p.price_per_kg);
		if (ppk <= 0 && flt(p.rate) > 0 && flt(p.pack_weight_kg) > 0) {
			ppk = (flt(p.rate) - bc) / flt(p.pack_weight_kg);
		}

		rows.push({
			idx: i,
			deal_name: p.deal_name,
			deal_item_name: p.deal_item_name,
			soda_date: p.soda_date,
			customer_name: p.customer_name,
			item: p.item,
			item_name: p.item_name,
			original_pack_size: p.pack_size,
			original_pack_weight_kg: flt(p.pack_weight_kg),
			pack_size: p.pack_size,
			pack_weight_kg: flt(p.pack_weight_kg),
			qty: flt(p.qty),
			already_delivered: flt(p.already_delivered),
			pending_qty: flt(p.pending_qty),
			pending_quintal: flt(p.pending_quintal),
			price_per_kg: ppk,
			base_price_50kg: flt(p.base_price_50kg),
			deliver_qty: flt(p.pending_qty),
			bag_cost: bc,
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
			+ 'All items pre-selected with full pending qty. Change <b>Pack Size</b> if loading different packs. Adjust <b>Deliver Qty</b> as needed.</div>';

		// Table
		html += '<div style="max-height:380px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;">';
		html += '<table class="table table-sm" style="margin-bottom:0;font-size:12px;">';
		html += '<thead style="background:#f7fafc;position:sticky;top:0;z-index:1;">';
		html += '<tr>';
		html += '<th style="width:30px;text-align:center;padding:7px 3px;font-size:10px;">SEL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">DEAL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">ITEM</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">PENDING QTL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">PACK SIZE</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">WT</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">BAG COST</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;width:75px;">DELIVER QTY</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">RATE</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">AMOUNT</th>';
		html += '<th style="width:30px;padding:7px 3px;font-size:10px;"></th>';
		html += '</tr></thead><tbody>';

		rows.forEach(function(row) {
			let amount = flt(row.deliver_qty) * flt(row.rate);
			let pack_changed = row.pack_size && row.pack_size !== row.original_pack_size;
			let row_bg = '';
			if (row.is_split) row_bg = 'background:#faf5ff;';
			else if (row.checked && pack_changed) row_bg = 'background:#fffff0;';
			else if (row.checked) row_bg = 'background:#f0fff4;';

			html += '<tr style="' + row_bg + '" data-idx="' + row.idx + '">';

			// Checkbox
			html += '<td style="text-align:center;vertical-align:middle;padding:5px 3px;">'
				+ '<input type="checkbox" class="row-check" data-idx="' + row.idx + '" '
				+ (row.checked ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;">'
				+ '</td>';

			// Deal
			if (row.is_split) {
				html += '<td style="vertical-align:middle;padding:5px;font-size:10px;color:#a0aec0;">'
					+ '↳ split</td>';
			} else {
				html += '<td style="vertical-align:middle;padding:5px;font-size:11px;">'
					+ '<span style="font-weight:600;color:#2b6cb0;">' + row.deal_name + '</span>'
					+ '<br><span style="color:#a0aec0;font-size:10px;">' + frappe.datetime.str_to_user(row.soda_date) + '</span>'
					+ '</td>';
			}

			// Item
			html += '<td style="vertical-align:middle;padding:5px;font-weight:500;' + (row.is_split ? 'color:#a0aec0;' : '') + '">'
				+ (row.item_name || row.item) + '</td>';

			// Pending Quintal — show remaining for this deal_item group
			let sibling_qtl = get_sibling_quintal(rows, row);
			let remaining_qtl = flt(row.pending_quintal) - sibling_qtl;
			let has_siblings = rows.some(function(r) {
				return r !== row && r.deal_item_name === row.deal_item_name;
			});
			if (row.is_split) {
				html += '<td class="remaining-cell" data-row-idx="' + row.idx + '" data-is-split="1" style="text-align:right;vertical-align:middle;padding:5px;color:#a0aec0;font-size:11px;">'
					+ remaining_qtl.toFixed(2) + ' left</td>';
			} else if (has_siblings) {
				html += '<td class="remaining-cell" data-row-idx="' + row.idx + '" data-is-split="0" style="text-align:right;vertical-align:middle;padding:5px;font-weight:600;color:#805ad5;">'
					+ '<span style="font-size:10px;color:#a0aec0;">' + row.pending_quintal.toFixed(2) + '</span>'
					+ '<br>' + remaining_qtl.toFixed(2) + ' left</td>';
			} else {
				html += '<td class="remaining-cell" data-row-idx="' + row.idx + '" data-is-split="0" style="text-align:right;vertical-align:middle;padding:5px;font-weight:600;color:#805ad5;">'
					+ row.pending_quintal.toFixed(2) + '</td>';
			}

			// Pack Size (dropdown)
			let pack_select = '<select class="pack-select" data-idx="' + row.idx + '" '
				+ 'style="padding:4px 5px;border:1px solid ' + (pack_changed ? '#d69e2e' : '#cbd5e0') + ';border-radius:4px;font-size:11.5px;min-width:90px;'
				+ (pack_changed ? 'font-weight:600;background:#fffff0;' : '') + '">';
			if (row.is_split && !row.pack_size) {
				pack_select += '<option value="" selected>-- Select --</option>';
			}
			pack_sizes.forEach(function(ps) {
				pack_select += '<option value="' + ps.pack_size + '"'
					+ (row.pack_size === ps.pack_size ? ' selected' : '') + '>'
					+ ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
			});
			pack_select += '</select>';
			html += '<td style="vertical-align:middle;padding:5px;">' + pack_select;
			if (pack_changed && !row.is_split) {
				html += '<br><span style="font-size:9px;color:#a0aec0;">was: ' + row.original_pack_size + '</span>';
			}
			html += '</td>';

			// Weight
			html += '<td style="text-align:right;vertical-align:middle;padding:5px;color:#718096;font-size:11px;">'
				+ row.pack_weight_kg + '</td>';

			// Bag Cost
			html += '<td style="text-align:right;vertical-align:middle;padding:5px;color:#718096;font-size:11px;">'
				+ (flt(row.bag_cost) > 0 ? format_number(row.bag_cost) : '--') + '</td>';

			// Deliver Qty (editable)
			html += '<td style="text-align:right;vertical-align:middle;padding:5px;">'
				+ '<input type="number" class="deliver-input" data-idx="' + row.idx + '" '
				+ 'value="' + (row.deliver_qty || '') + '" min="0" '
				+ 'style="width:68px;padding:4px 5px;border:1px solid #cbd5e0;border-radius:4px;text-align:right;font-size:12px;font-weight:600;">'
				+ '</td>';

			// Rate
			html += '<td style="text-align:right;vertical-align:middle;padding:5px;color:#718096;font-size:12px;">'
				+ format_number(row.rate) + '</td>';

			// Amount
			html += '<td class="amount-cell" data-row-idx="' + row.idx + '" style="text-align:right;vertical-align:middle;padding:5px;'
				+ (amount > 0 ? 'font-weight:600;' : 'color:#718096;') + 'font-size:12px;">'
				+ (amount > 0 ? format_number(amount) : '--') + '</td>';

			// Split +/- button
			if (row.is_split) {
				html += '<td style="text-align:center;vertical-align:middle;padding:3px;">'
					+ '<button class="split-remove" data-idx="' + row.idx + '" '
					+ 'style="padding:1px 6px;font-size:16px;color:#e53e3e;border:none;background:none;cursor:pointer;font-weight:bold;" title="Remove split">&minus;</button>'
					+ '</td>';
			} else {
				html += '<td style="text-align:center;vertical-align:middle;padding:3px;">'
					+ '<button class="split-add" data-idx="' + row.idx + '" '
					+ 'style="padding:1px 6px;font-size:16px;color:#38a169;border:none;background:none;cursor:pointer;font-weight:bold;" title="Add another pack size">+</button>'
					+ '</td>';
			}

			html += '</tr>';
		});

		html += '</tbody></table></div>';

		// Footer summary
		let summary = get_dialog_summary(rows);
		html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 0;">';
		html += '<div class="dialog-footer-summary" style="display:flex;gap:20px;font-size:12.5px;color:#4a5568;">';
		html += '<div>Selected: <strong>' + summary.selected + '</strong> of ' + rows.length + '</div>';
		html += '<div>Deliver: <strong>' + summary.total_qty + '</strong> packs</div>';
		html += '<div>Quintal: <strong>' + summary.total_quintal.toFixed(2) + '</strong></div>';
		html += '<div>Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
		html += '</div></div>';

		wrapper.html(html);

		// Bind events
		bind_get_items_events(wrapper, rows, pack_weight_map, bag_cost_map, render_table);
	}

	render_table();
	d.show();
	d.$wrapper.find('.modal-dialog').css('max-width', '1100px');
}


function bind_get_items_events(wrapper, rows, pack_weight_map, bag_cost_map, render_table) {
	// Checkbox
	wrapper.find('.row-check').off('change').on('change', function() {
		let idx = parseInt($(this).data('idx'));
		let row = rows[idx];
		if (row) {
			row.checked = $(this).is(':checked');
			if (!row.checked) {
				row.deliver_qty = 0;
			} else {
				row.deliver_qty = calc_deliver_packs_remaining(rows, row);
			}
			render_table();
		}
	});

	// Pack size dropdown
	wrapper.find('.pack-select').off('change').on('change', function() {
		let idx = parseInt($(this).data('idx'));
		let new_pack = $(this).val();
		let row = rows[idx];
		if (row && new_pack) {
			row.pack_size = new_pack;
			row.pack_weight_kg = pack_weight_map[new_pack] || 0;

			// Recalculate rate and bag cost for new pack size
			let bc = flt(bag_cost_map[row.item + ':' + new_pack]);
			row.bag_cost = bc;
			row.rate = (flt(row.price_per_kg) * flt(row.pack_weight_kg)) + bc;

			// Auto-convert deliver_qty to match remaining quintal
			row.deliver_qty = calc_deliver_packs_remaining(rows, row);

			// Auto-check
			if (!row.checked) row.checked = true;
			render_table();
		}
	});

	// Deliver qty — real-time update with validation (caps immediately)
	wrapper.find('.deliver-input').off('input').on('input', function() {
		let idx = parseInt($(this).data('idx'));
		let val = parseFloat($(this).val()) || 0;
		let row = rows[idx];
		if (!row) return;
		if (val < 0) val = 0;

		// Cap in quintal — account for sibling rows (same deal_item)
		let sibling_qtl = get_sibling_quintal(rows, row);
		let available_qtl = flt(row.pending_quintal) - sibling_qtl;
		let delivering_qtl = (val * flt(row.pack_weight_kg)) / 100;

		if (flt(row.pack_weight_kg) > 0 && delivering_qtl > available_qtl + 0.01) {
			let max_packs = Math.floor(available_qtl * 100 / flt(row.pack_weight_kg));
			if (max_packs < 0) max_packs = 0;
			val = max_packs;
			$(this).val(val);
			frappe.show_alert({
				message: __('Max {0} packs ({1} Qtl available)', [max_packs, available_qtl.toFixed(2)]),
				indicator: 'orange'
			}, 3);
		}

		row.deliver_qty = val;
		if (val > 0) row.checked = true;

		// Update amount cell for this row
		let amount = flt(row.deliver_qty) * flt(row.rate);
		let $amt = wrapper.find('.amount-cell[data-row-idx="' + idx + '"]');
		$amt.html(amount > 0 ? format_number(amount) : '--');
		$amt.css({'font-weight': amount > 0 ? '600' : '', 'color': amount > 0 ? '' : '#718096'});

		// Update remaining cells for ALL rows with same deal_item
		rows.forEach(function(r) {
			if (r.deal_item_name === row.deal_item_name) {
				let sib = get_sibling_quintal(rows, r);
				let rem = flt(r.pending_quintal) - sib;
				let $cell = wrapper.find('.remaining-cell[data-row-idx="' + r.idx + '"]');
				if (r.is_split) {
					$cell.text(rem.toFixed(2) + ' left');
					$cell.css('color', rem < 0.01 ? '#e53e3e' : '#a0aec0');
				} else {
					// Parent row: show total + remaining
					let has_sibs = rows.some(function(s) { return s !== r && s.deal_item_name === r.deal_item_name; });
					if (has_sibs) {
						$cell.html(
							'<span style="font-size:10px;color:#a0aec0;">' + r.pending_quintal.toFixed(2) + '</span>'
							+ '<br>' + rem.toFixed(2) + ' left'
						);
					}
				}
			}
		});

		// Update footer summary
		let summary = get_dialog_summary(rows);
		wrapper.find('.dialog-footer-summary').html(
			'<div>Selected: <strong>' + summary.selected + '</strong> of ' + rows.length + '</div>'
			+ '<div>Deliver: <strong>' + summary.total_qty + '</strong> packs</div>'
			+ '<div>Quintal: <strong>' + summary.total_quintal.toFixed(2) + '</strong></div>'
			+ '<div>Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>'
		);
	});

	// Deliver qty — re-render on blur for clean state
	wrapper.find('.deliver-input').off('change').on('change', function() {
		render_table();
	});

	// Split: add another pack size row
	wrapper.find('.split-add').off('click').on('click', function() {
		let idx = parseInt($(this).data('idx'));
		let source = rows[idx];
		let new_row = {
			deal_name: source.deal_name,
			deal_item_name: source.deal_item_name,
			soda_date: source.soda_date,
			customer_name: source.customer_name,
			item: source.item,
			item_name: source.item_name,
			original_pack_size: source.original_pack_size,
			original_pack_weight_kg: source.original_pack_weight_kg,
			pack_size: '',
			pack_weight_kg: 0,
			qty: source.qty,
			already_delivered: source.already_delivered,
			pending_qty: source.pending_qty,
			pending_quintal: source.pending_quintal,
			price_per_kg: source.price_per_kg,
			base_price_50kg: source.base_price_50kg,
			deliver_qty: 0,
			bag_cost: 0,
			rate: 0,
			checked: true,
			is_split: true
		};
		rows.splice(idx + 1, 0, new_row);
		reindex_rows(rows);
		render_table();
	});

	// Split: remove row
	wrapper.find('.split-remove').off('click').on('click', function() {
		let idx = parseInt($(this).data('idx'));
		rows.splice(idx, 1);
		reindex_rows(rows);
		render_table();
	});
}


function calc_deliver_packs(row) {
	/**Convert pending quintal to packs for current pack size.*/
	if (flt(row.pack_weight_kg) <= 0) return 0;
	return Math.floor(flt(row.pending_quintal) * 100 / flt(row.pack_weight_kg));
}


function calc_deliver_packs_remaining(rows, row) {
	/**Convert remaining quintal (after siblings) to packs for current pack size.*/
	if (flt(row.pack_weight_kg) <= 0) return 0;
	let sibling_qtl = get_sibling_quintal(rows, row);
	let remaining_qtl = flt(row.pending_quintal) - sibling_qtl;
	if (remaining_qtl <= 0) return 0;
	return Math.floor(remaining_qtl * 100 / flt(row.pack_weight_kg));
}


function get_sibling_quintal(rows, current_row) {
	/**Get total quintal being delivered by sibling rows (same deal_item, excluding current row).*/
	let total = 0;
	rows.forEach(function(r) {
		if (r !== current_row && r.deal_item_name === current_row.deal_item_name && r.checked) {
			total += (flt(r.deliver_qty) * flt(r.pack_weight_kg)) / 100;
		}
	});
	return total;
}


function reindex_rows(rows) {
	rows.forEach(function(r, i) { r.idx = i; });
}


function get_dialog_summary(rows) {
	let selected = 0;
	let total_qty = 0;
	let total_quintal = 0;
	let total_amount = 0;

	rows.forEach(function(row) {
		if (row.checked && row.deliver_qty > 0) {
			selected++;
			total_qty += flt(row.deliver_qty);
			total_quintal += (flt(row.deliver_qty) * flt(row.pack_weight_kg)) / 100;
			total_amount += flt(row.deliver_qty) * flt(row.rate);
		}
	});

	return {
		selected: selected,
		total_qty: total_qty,
		total_quintal: total_quintal,
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
			pack_weight_kg: row.pack_weight_kg,
			soda_qty: row.qty,
			already_delivered: row.already_delivered,
			pending_qty: row.pending_qty,
			deliver_qty: row.deliver_qty,
			bag_cost: row.bag_cost,
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
		child.pack_weight_kg = item.pack_weight_kg;
		child.soda_qty = item.soda_qty;
		child.already_delivered = item.already_delivered;
		child.pending_qty = item.pending_qty;
		child.deliver_qty = item.deliver_qty;
		child.bag_cost = item.bag_cost;
		child.rate = item.rate;
		child.amount = item.amount;
		child.is_extra = 0;
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
// Add Extra Item Dialog
// ============================================================

function show_add_extra_dialog(frm) {
	let d = new frappe.ui.Dialog({
		title: __('Add Extra Item'),
		fields: [
			{
				fieldname: 'item',
				fieldtype: 'Link',
				label: __('Item'),
				options: 'Item',
				reqd: 1,
				get_query: function() {
					return { filters: { disabled: 0 } };
				}
			},
			{
				fieldname: 'pack_size',
				fieldtype: 'Link',
				label: __('Pack Size'),
				options: 'Deal Pack Size',
				reqd: 1,
				get_query: function() {
					return { filters: { is_active: 1 } };
				}
			},
			{
				fieldname: 'pack_weight_kg',
				fieldtype: 'Float',
				label: __('Pack Weight (KG)'),
				read_only: 1
			},
			{
				fieldname: 'bag_cost',
				fieldtype: 'Currency',
				label: __('Bag Cost'),
				read_only: 1,
				default: 0
			},
			{ fieldtype: 'Column Break' },
			{
				fieldname: 'deliver_qty',
				fieldtype: 'Float',
				label: __('Qty (Packs)'),
				reqd: 1
			},
			{
				fieldname: 'rate',
				fieldtype: 'Currency',
				label: __('Rate (per Pack)'),
				reqd: 1,
				description: __('Enter rate manually or use Fetch Rate')
			},
			{
				fieldname: 'amount',
				fieldtype: 'Currency',
				label: __('Amount'),
				read_only: 1
			},
			{ fieldtype: 'Section Break', label: __('Fetch Rate from Price List') },
			{
				fieldname: 'price_list_area',
				fieldtype: 'Link',
				label: __('Price List Area'),
				options: 'Deal Price List Area',
				description: __('Optional: select area and click Fetch Rate')
			},
			{
				fieldname: 'fetch_rate_btn',
				fieldtype: 'Button',
				label: __('Fetch Rate')
			}
		],
		primary_action_label: __('Add to Delivery'),
		primary_action: function(values) {
			if (!values.item || !values.pack_size || !values.deliver_qty || !values.rate) {
				frappe.msgprint(__('Please fill all required fields.'));
				return;
			}

			let child = frm.add_child('items');
			child.item = values.item;
			child.pack_size = values.pack_size;
			child.pack_weight_kg = values.pack_weight_kg || 0;
			child.deliver_qty = values.deliver_qty;
			child.bag_cost = values.bag_cost || 0;
			child.rate = values.rate;
			child.amount = flt(values.deliver_qty) * flt(values.rate);
			child.is_extra = 1;
			child.soda = '';
			child.deal_item = '';
			child.customer = frm.doc.customer_name || '';

			frm.refresh_field('items');
			recalculate_totals(frm);
			frm.dirty();

			d.hide();
			frappe.show_alert({
				message: __('Added extra item: {0}', [values.item]),
				indicator: 'green'
			}, 5);
		}
	});

	// Fetch weight and bag cost when pack_size changes
	d.fields_dict.pack_size.df.onchange = function() {
		let ps = d.get_value('pack_size');
		let item = d.get_value('item');
		if (ps) {
			frappe.db.get_value('Deal Pack Size', ps, 'weight_kg', function(r) {
				if (r) d.set_value('pack_weight_kg', flt(r.weight_kg));
			});
			// Fetch bag cost if item is also set
			if (item) {
				frappe.db.get_value('Package Bag Master', {item: item, pack_size: ps, is_active: 1}, 'bag_cost', function(r) {
					d.set_value('bag_cost', r ? flt(r.bag_cost) : 0);
				});
			}
		}
	};

	// Also fetch bag cost when item changes (if pack_size already set)
	d.fields_dict.item.df.onchange = function() {
		let item = d.get_value('item');
		let ps = d.get_value('pack_size');
		if (item && ps) {
			frappe.db.get_value('Package Bag Master', {item: item, pack_size: ps, is_active: 1}, 'bag_cost', function(r) {
				d.set_value('bag_cost', r ? flt(r.bag_cost) : 0);
			});
		}
	};

	// Auto-calculate amount when qty or rate changes
	d.fields_dict.deliver_qty.df.onchange = function() {
		d.set_value('amount', flt(d.get_value('deliver_qty')) * flt(d.get_value('rate')));
	};
	d.fields_dict.rate.df.onchange = function() {
		d.set_value('amount', flt(d.get_value('deliver_qty')) * flt(d.get_value('rate')));
	};

	// Fetch Rate button
	d.fields_dict.fetch_rate_btn.df.click = function() {
		let area = d.get_value('price_list_area');
		let item = d.get_value('item');
		let ps = d.get_value('pack_size');
		if (!area || !item || !ps) {
			frappe.msgprint(__('Please select Item, Pack Size and Price List Area first.'));
			return;
		}
		frappe.call({
			method: 'trustbit_mandi.trustbit_mandi.doctype.deal_price_list.deal_price_list.get_rate_for_pack_size',
			args: { price_list_area: area, item: item, pack_size: ps },
			callback: function(r) {
				if (r.message) {
					d.set_value('rate', r.message.rate);
					d.set_value('pack_weight_kg', r.message.pack_weight_kg || 0);
					d.set_value('amount', flt(d.get_value('deliver_qty')) * flt(r.message.rate));
					frappe.show_alert({
						message: __('Rate fetched: {0} per pack', [r.message.rate.toFixed(2)]),
						indicator: 'green'
					}, 3);
				} else {
					frappe.show_alert({
						message: __('No price found for this combination.'),
						indicator: 'orange'
					}, 3);
				}
			}
		});
	};

	d.show();
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
	let total_qty = 0, total_quintal = 0, total_amount = 0;
	(frm.doc.items || []).forEach(function(row) {
		total_qty += flt(row.deliver_qty);
		total_quintal += (flt(row.deliver_qty) * flt(row.pack_weight_kg)) / 100;
		total_amount += flt(row.amount);
	});
	frm.set_value('total_delivery_qty', total_qty);
	frm.set_value('total_delivery_quintal', total_quintal);
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
