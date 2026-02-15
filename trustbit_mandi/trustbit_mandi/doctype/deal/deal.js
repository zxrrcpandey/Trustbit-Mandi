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

		// Add Items button (when area is set and deal is not closed)
		if (frm.doc.price_list_area && frm.doc.status !== 'Cancelled'
			&& frm.doc.status !== 'Delivered') {
			frm.add_custom_button(__('Add Items'), function() {
				show_add_items_dialog(frm);
			}).addClass('btn-primary-dark');
		}

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


// ============================================================
// Add Items from Price List Dialog
// ============================================================

function show_add_items_dialog(frm) {
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_price_list.deal_price_list.get_all_prices_for_area',
		args: { price_list_area: frm.doc.price_list_area },
		freeze: true,
		freeze_message: __('Loading price list...'),
		callback: function(r) {
			if (!r.message || !r.message.prices || r.message.prices.length === 0) {
				frappe.msgprint(__('No active prices found for area: {0}', [frm.doc.price_list_area]));
				return;
			}
			build_add_items_dialog(frm, r.message.prices, r.message.pack_sizes);
		}
	});
}

function build_add_items_dialog(frm, prices, pack_sizes) {
	// Build pack size options HTML
	let pack_options = '<option value="">-- Select --</option>';
	pack_sizes.forEach(function(ps) {
		pack_options += '<option value="' + ps.pack_size + '" data-weight="' + ps.weight_kg + '">'
			+ ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
	});

	// Build pack_sizes lookup
	let pack_weight_map = {};
	pack_sizes.forEach(function(ps) {
		pack_weight_map[ps.pack_size] = ps.weight_kg;
	});

	// State: each row has { id, item, item_name, item_group, base_price_50kg, original_price, price_list_name, is_sub, parent_id, pack_size, weight_kg, qty, checked }
	let row_counter = 0;
	let rows = [];
	prices.forEach(function(p) {
		row_counter++;
		rows.push({
			id: row_counter,
			item: p.item,
			item_name: p.item_name,
			item_group: p.item_group || p.item_group_link || '',
			base_price_50kg: p.base_price_50kg,
			original_price: p.base_price_50kg,
			price_per_kg: p.price_per_kg,
			price_list_name: p.price_list_name,
			is_sub: false,
			parent_id: null,
			pack_size: '',
			weight_kg: 0,
			qty: 0,
			checked: false
		});
	});

	let d = new frappe.ui.Dialog({
		title: __('Add Items from Price List'),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'dialog_content'
			}
		],
		primary_action_label: __('Add to Deal'),
		primary_action: function() {
			add_selected_to_deal(frm, rows, pack_weight_map, d);
		}
	});

	// Set title badge for area
	d.$wrapper.find('.modal-title').append(
		' <span style="background:#e8f4fd;color:#1565c0;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500;margin-left:8px;">'
		+ frm.doc.price_list_area + '</span>'
	);

	let wrapper = d.fields_dict.dialog_content.$wrapper;
	wrapper.css('min-height', '400px');

	function render_table(filter_text) {
		filter_text = (filter_text || '').toLowerCase();

		let html = '';

		// Toolbar
		html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;">';
		html += '<input type="text" class="add-items-search" placeholder="Search items..." '
			+ 'style="flex:1;max-width:280px;padding:7px 12px;border:1px solid #d1d8dd;border-radius:6px;font-size:13px;" value="' + (filter_text || '') + '">';
		html += '<div style="font-size:11px;color:#718096;padding:6px 10px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;">'
			+ 'Edit <b>Base Price (50 KG)</b> to override for this deal only. Original price list stays unchanged.</div>';
		html += '</div>';

		// Table
		html += '<div style="max-height:380px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;">';
		html += '<table class="table table-sm" style="margin-bottom:0;font-size:12.5px;">';
		html += '<thead style="background:#f7fafc;position:sticky;top:0;z-index:1;">';
		html += '<tr>';
		html += '<th style="width:32px;text-align:center;padding:8px 4px;font-size:11px;">SEL</th>';
		html += '<th style="padding:8px 6px;font-size:11px;">ITEM</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">BASE PRICE<br>(50 KG)</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">&#8377;/KG</th>';
		html += '<th style="padding:8px 6px;font-size:11px;">PACK SIZE</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">WT</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;width:60px;">QTY</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">RATE/PACK</th>';
		html += '<th style="text-align:right;padding:8px 6px;font-size:11px;">AMOUNT</th>';
		html += '<th style="width:32px;padding:8px 4px;"></th>';
		html += '</tr></thead><tbody>';

		let visible_count = 0;
		rows.forEach(function(row) {
			// Filter: only filter main rows, sub-rows follow parent
			if (!row.is_sub) {
				let match = !filter_text
					|| (row.item_name || '').toLowerCase().indexOf(filter_text) > -1
					|| (row.item || '').toLowerCase().indexOf(filter_text) > -1
					|| (row.item_group || '').toLowerCase().indexOf(filter_text) > -1;
				row._visible = match;
			} else {
				// Sub-row follows parent visibility
				let parent = rows.find(function(r) { return r.id === row.parent_id; });
				row._visible = parent ? parent._visible : true;
			}
			if (!row._visible) return;
			visible_count++;

			let price_per_kg = flt(row.base_price_50kg) / 50;
			let rate = row.weight_kg > 0 ? price_per_kg * row.weight_kg : 0;
			let amount = rate * flt(row.qty);
			let price_changed = Math.abs(flt(row.base_price_50kg) - flt(row.original_price)) > 0.01;

			let row_class = '';
			if (row.is_sub) row_class = 'style="background:#fafafa;"';
			else if (row.checked && price_changed) row_class = 'style="background:#fffff0;"';
			else if (row.checked) row_class = 'style="background:#f0fff4;"';

			html += '<tr ' + row_class + ' data-row-id="' + row.id + '">';

			// Checkbox
			if (!row.is_sub) {
				html += '<td style="text-align:center;vertical-align:middle;padding:6px 4px;">'
					+ '<input type="checkbox" class="row-check" data-id="' + row.id + '" '
					+ (row.checked ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;">'
					+ '</td>';
			} else {
				html += '<td style="border-left:3px solid #2b6cb0;padding:6px 4px;"></td>';
			}

			// Item
			if (!row.is_sub) {
				html += '<td style="vertical-align:middle;padding:6px;">'
					+ '<span style="font-weight:600;color:#1a202c;">' + (row.item_name || row.item) + '</span>'
					+ '<br><span style="font-size:11px;color:#a0aec0;">' + (row.item_group || '') + '</span>'
					+ '</td>';
			} else {
				html += '<td style="padding:6px 6px 6px 20px;color:#718096;vertical-align:middle;">'
					+ '&#8627; same item</td>';
			}

			// Base Price (50 KG) - editable for main rows, display for sub
			if (!row.is_sub) {
				let price_style = price_changed
					? 'border-color:#d69e2e;font-weight:600;background:#fffff0;'
					: '';
				html += '<td style="text-align:right;vertical-align:middle;padding:6px;">'
					+ '<input type="number" class="price-input" data-id="' + row.id + '" '
					+ 'value="' + flt(row.base_price_50kg) + '" '
					+ 'style="width:90px;padding:5px 6px;border:1px solid #cbd5e0;border-radius:4px;text-align:right;font-size:12.5px;' + price_style + '">';
				if (price_changed) {
					html += '<br><span style="font-size:10px;color:#a0aec0;text-decoration:line-through;">Was: '
						+ format_number(row.original_price) + '</span>';
				}
				html += '</td>';
			} else {
				let parent = rows.find(function(r) { return r.id === row.parent_id; });
				html += '<td style="text-align:right;vertical-align:middle;padding:6px;color:#a0aec0;font-size:12px;">'
					+ format_number(parent ? parent.base_price_50kg : row.base_price_50kg) + '</td>';
			}

			// Price/KG
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;color:#718096;font-size:12px;">'
				+ price_per_kg.toFixed(2) + '</td>';

			// Pack Size
			let selected_pack = row.pack_size || '';
			let pack_html = '<select class="pack-select" data-id="' + row.id + '" '
				+ 'style="padding:5px 6px;border:1px solid #cbd5e0;border-radius:4px;font-size:12.5px;min-width:100px;">';
			pack_html += '<option value="">-- Select --</option>';
			pack_sizes.forEach(function(ps) {
				pack_html += '<option value="' + ps.pack_size + '" data-weight="' + ps.weight_kg + '"'
					+ (selected_pack === ps.pack_size ? ' selected' : '') + '>'
					+ ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
			});
			pack_html += '</select>';
			html += '<td style="vertical-align:middle;padding:6px;">' + pack_html + '</td>';

			// Weight
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;color:#718096;font-size:11.5px;">'
				+ (row.weight_kg > 0 ? row.weight_kg : '--') + '</td>';

			// Qty
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;">'
				+ '<input type="number" class="qty-input" data-id="' + row.id + '" '
				+ 'value="' + (row.qty || '') + '" placeholder="0" min="0" '
				+ 'style="width:60px;padding:5px 6px;border:1px solid #cbd5e0;border-radius:4px;text-align:right;font-size:12.5px;">'
				+ '</td>';

			// Rate/Pack
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;'
				+ (rate > 0 ? 'font-weight:600;color:#2d3748;' : 'color:#718096;font-size:12px;') + '">'
				+ (rate > 0 ? format_number(rate) : '--') + '</td>';

			// Amount
			html += '<td style="text-align:right;vertical-align:middle;padding:6px;'
				+ (amount > 0 ? 'font-weight:600;color:#2d3748;' : 'color:#718096;font-size:12px;') + '">'
				+ (amount > 0 ? format_number(amount) : '--') + '</td>';

			// + / x button
			if (!row.is_sub) {
				html += '<td style="text-align:center;vertical-align:middle;padding:6px;">'
					+ '<button class="btn-add-pack" data-id="' + row.id + '" title="Add another pack size" '
					+ 'style="width:26px;height:26px;border-radius:50%;border:1px solid #cbd5e0;background:#fff;color:#4a5568;cursor:pointer;font-size:16px;line-height:1;">+</button>'
					+ '</td>';
			} else {
				html += '<td style="text-align:center;vertical-align:middle;padding:6px;">'
					+ '<button class="btn-remove-pack" data-id="' + row.id + '" title="Remove" '
					+ 'style="width:22px;height:22px;border-radius:50%;border:1px solid #fed7d7;background:#fff5f5;color:#e53e3e;cursor:pointer;font-size:13px;line-height:1;">&times;</button>'
					+ '</td>';
			}

			html += '</tr>';
		});

		html += '</tbody></table></div>';

		// Footer summary
		let summary = get_selection_summary(rows, pack_weight_map);
		html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 0;">';
		html += '<div style="display:flex;gap:24px;font-size:13px;color:#4a5568;">';
		html += '<div>Items: <strong>' + summary.items + '</strong> (' + summary.lines + ' lines)</div>';
		html += '<div>Total Qty: <strong>' + summary.total_qty + '</strong></div>';
		html += '<div>Total Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
		html += '</div></div>';

		wrapper.html(html);

		// Bind events
		bind_dialog_events(wrapper, rows, pack_weight_map, pack_sizes, render_table, d);
	}

	render_table('');
	d.show();
	d.$wrapper.find('.modal-dialog').css('max-width', '1040px');
}


function bind_dialog_events(wrapper, rows, pack_weight_map, pack_sizes, render_table, dialog) {
	// Search
	wrapper.find('.add-items-search').off('input').on('input', function() {
		let val = $(this).val();
		render_table(val);
		// Re-focus search and restore cursor
		let search = wrapper.find('.add-items-search');
		search.focus().val('').val(val);
	});

	// Checkbox
	wrapper.find('.row-check').off('change').on('change', function() {
		let id = parseInt($(this).data('id'));
		let row = rows.find(function(r) { return r.id === id; });
		if (row) {
			row.checked = $(this).is(':checked');
			update_footer(wrapper, rows, pack_weight_map);
		}
	});

	// Price input
	wrapper.find('.price-input').off('change').on('change', function() {
		let id = parseInt($(this).data('id'));
		let val = parseFloat($(this).val()) || 0;
		let row = rows.find(function(r) { return r.id === id; });
		if (row) {
			row.base_price_50kg = val;
			row.price_per_kg = val / 50;
			// Update all sub-rows of this parent
			rows.forEach(function(r) {
				if (r.parent_id === id) {
					r.base_price_50kg = val;
					r.price_per_kg = val / 50;
				}
			});
			let filter_val = wrapper.find('.add-items-search').val() || '';
			render_table(filter_val);
			wrapper.find('.add-items-search').focus();
		}
	});

	// Pack size select
	wrapper.find('.pack-select').off('change').on('change', function() {
		let id = parseInt($(this).data('id'));
		let pack = $(this).val();
		let row = rows.find(function(r) { return r.id === id; });
		if (row) {
			row.pack_size = pack;
			row.weight_kg = pack_weight_map[pack] || 0;
			// Auto-check when pack size is selected
			if (pack && !row.is_sub) {
				row.checked = true;
			}
			let filter_val = wrapper.find('.add-items-search').val() || '';
			render_table(filter_val);
		}
	});

	// Qty input
	wrapper.find('.qty-input').off('change').on('change', function() {
		let id = parseInt($(this).data('id'));
		let val = parseFloat($(this).val()) || 0;
		let row = rows.find(function(r) { return r.id === id; });
		if (row) {
			row.qty = val;
			// Auto-check when qty is entered
			if (val > 0 && !row.is_sub) {
				row.checked = true;
			}
			let filter_val = wrapper.find('.add-items-search').val() || '';
			render_table(filter_val);
		}
	});

	// Add pack size (+) button
	wrapper.find('.btn-add-pack').off('click').on('click', function() {
		let id = parseInt($(this).data('id'));
		let parent = rows.find(function(r) { return r.id === id; });
		if (!parent) return;

		// Auto-check parent
		parent.checked = true;

		// Find insert position (after last sub-row of this parent, or after parent)
		let insert_idx = rows.indexOf(parent);
		for (let i = insert_idx + 1; i < rows.length; i++) {
			if (rows[i].parent_id === id) insert_idx = i;
			else break;
		}

		let new_id = Math.max.apply(null, rows.map(function(r) { return r.id; })) + 1;
		let sub_row = {
			id: new_id,
			item: parent.item,
			item_name: parent.item_name,
			item_group: parent.item_group,
			base_price_50kg: parent.base_price_50kg,
			original_price: parent.original_price,
			price_per_kg: parent.price_per_kg,
			price_list_name: parent.price_list_name,
			is_sub: true,
			parent_id: id,
			pack_size: '',
			weight_kg: 0,
			qty: 0,
			checked: false
		};
		rows.splice(insert_idx + 1, 0, sub_row);

		let filter_val = wrapper.find('.add-items-search').val() || '';
		render_table(filter_val);
	});

	// Remove sub-row (x) button
	wrapper.find('.btn-remove-pack').off('click').on('click', function() {
		let id = parseInt($(this).data('id'));
		let idx = rows.findIndex(function(r) { return r.id === id; });
		if (idx > -1) {
			rows.splice(idx, 1);
			let filter_val = wrapper.find('.add-items-search').val() || '';
			render_table(filter_val);
		}
	});
}


function get_selection_summary(rows, pack_weight_map) {
	let items_set = {};
	let lines = 0;
	let total_qty = 0;
	let total_amount = 0;

	rows.forEach(function(row) {
		let is_selected = row.is_sub
			? (rows.find(function(r) { return r.id === row.parent_id; }) || {}).checked
			: row.checked;

		if (is_selected && row.pack_size && row.qty > 0) {
			items_set[row.item] = true;
			lines++;
			total_qty += flt(row.qty);
			let price_per_kg = flt(row.base_price_50kg) / 50;
			let rate = price_per_kg * flt(row.weight_kg);
			total_amount += rate * flt(row.qty);
		}
	});

	return {
		items: Object.keys(items_set).length,
		lines: lines,
		total_qty: total_qty,
		total_amount: total_amount
	};
}


function update_footer(wrapper, rows, pack_weight_map) {
	// Quick footer update without full re-render
	let summary = get_selection_summary(rows, pack_weight_map);
	let footer_html = '<div>Items: <strong>' + summary.items + '</strong> (' + summary.lines + ' lines)</div>';
	footer_html += '<div>Total Qty: <strong>' + summary.total_qty + '</strong></div>';
	footer_html += '<div>Total Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
	wrapper.find('div').last().find('div').first().html(footer_html);
}


function add_selected_to_deal(frm, rows, pack_weight_map, dialog) {
	let items_to_add = [];

	rows.forEach(function(row) {
		// Check if this line should be added
		let is_selected = row.is_sub
			? (rows.find(function(r) { return r.id === row.parent_id; }) || {}).checked
			: row.checked;

		if (!is_selected) return;
		if (!row.pack_size || !row.qty || row.qty <= 0) return;

		let price_per_kg = flt(row.base_price_50kg) / 50;
		let rate = price_per_kg * flt(row.weight_kg);
		let amount = rate * flt(row.qty);

		items_to_add.push({
			item: row.item,
			item_name: row.item_name,
			pack_size: row.pack_size,
			pack_weight_kg: row.weight_kg,
			qty: row.qty,
			rate: rate,
			amount: amount,
			base_price_50kg: row.base_price_50kg,
			price_per_kg: price_per_kg,
			price_list_ref: row.price_list_name
		});
	});

	if (items_to_add.length === 0) {
		frappe.msgprint(__('No items selected. Please check items, select pack size, and enter qty.'));
		return;
	}

	// Add rows to child table
	items_to_add.forEach(function(item) {
		let child = frm.add_child('items');
		child.item = item.item;
		child.item_name = item.item_name;
		child.pack_size = item.pack_size;
		child.pack_weight_kg = item.pack_weight_kg;
		child.qty = item.qty;
		child.rate = item.rate;
		child.amount = item.amount;
		child.base_price_50kg = item.base_price_50kg;
		child.price_per_kg = item.price_per_kg;
		child.price_list_ref = item.price_list_ref;
		child.pending_qty = item.qty;
		child.delivered_qty = 0;
		child.item_status = 'Open';
	});

	frm.refresh_field('items');
	recalculate_deal_totals(frm);
	frm.dirty();

	dialog.hide();
	frappe.show_alert({
		message: __('Added {0} item(s) to the Deal', [items_to_add.length]),
		indicator: 'green'
	}, 5);
}


// ============================================================
// Existing helper functions
// ============================================================

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


function format_number(val) {
	val = flt(val);
	return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


function flt(value) {
	if (value === null || value === undefined || value === '') return 0;
	let num = parseFloat(value);
	return isNaN(num) ? 0 : num;
}
