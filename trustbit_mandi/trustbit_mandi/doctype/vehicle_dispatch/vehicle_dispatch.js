frappe.ui.form.on('Vehicle Dispatch', {
	refresh: function(frm) {
		// Custom status indicator
		if (frm.doc.docstatus === 0) {
			frm.page.set_indicator(__('Loading'), 'orange');
		} else if (frm.doc.docstatus === 1) {
			frm.page.set_indicator(__('Dispatched'), 'blue');
		} else if (frm.doc.docstatus === 2) {
			frm.page.set_indicator(__('Cancelled'), 'red');
		}

		// Render capacity bar
		render_capacity_bar(frm);

		// Buttons only in draft mode
		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__('Get Deliveries'), function() {
				get_deliveries_dialog(frm);
			}).addClass('btn-primary');

			frm.add_custom_button(__('Link Existing Delivery'), function() {
				link_existing_delivery_dialog(frm);
			});
		}
	},

	vehicle: function(frm) {
		setTimeout(function() {
			render_capacity_bar(frm);
		}, 500);
	},

	freight_amount: function(frm) {
		calculate_payment_balance(frm);
	}
});

frappe.ui.form.on('Vehicle Dispatch Payment', {
	amount: function(frm) {
		calculate_payment_balance(frm);
	},
	payments_remove: function(frm) {
		calculate_payment_balance(frm);
	}
});


// ============================================================
// Payment Helpers
// ============================================================

function calculate_payment_balance(frm) {
	let total_paid = 0;
	(frm.doc.payments || []).forEach(function(row) {
		total_paid += flt(row.amount);
	});
	frm.set_value('total_paid', total_paid);
	frm.set_value('balance_amount', flt(frm.doc.freight_amount) - total_paid);
}


// ============================================================
// Capacity Bar
// ============================================================

function render_capacity_bar(frm) {
	let wrapper = frm.fields_dict.capacity_bar_html;
	if (!wrapper) return;
	wrapper = wrapper.$wrapper;
	wrapper.empty();

	let capacity = flt(frm.doc.vehicle_capacity_kg);
	let loaded = flt(frm.doc.total_loaded_kg);

	if (!capacity) {
		wrapper.html('<div class="text-muted" style="padding:5px;">Select a vehicle to see capacity</div>');
		return;
	}

	let pct = Math.min((loaded / capacity) * 100, 100);
	let overflow_pct = loaded > capacity ? ((loaded - capacity) / capacity) * 100 : 0;
	let color = pct < 80 ? '#38a169' : (pct < 100 ? '#dd6b20' : '#e53e3e');

	let html = '<div style="padding:5px 0;">';
	html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">';
	html += '<span><b>' + loaded.toFixed(0) + ' / ' + capacity.toFixed(0) + ' KG</b></span>';
	html += '<span style="color:' + color + ';font-weight:bold;">' + pct.toFixed(1) + '%</span>';
	html += '</div>';
	html += '<div style="background:#e2e8f0;border-radius:6px;height:24px;overflow:hidden;position:relative;">';
	html += '<div style="background:' + color + ';height:100%;width:' + Math.min(pct, 100) + '%;border-radius:6px;transition:width 0.3s;"></div>';
	if (overflow_pct > 0) {
		html += '<div style="position:absolute;top:0;right:0;background:#e53e3e;color:white;padding:2px 8px;font-size:11px;border-radius:0 6px 6px 0;">OVERLOADED</div>';
	}
	html += '</div>';
	html += '</div>';

	wrapper.html(html);
}


// ============================================================
// NEW: Get Deliveries — Select from Pending Deal Items
// ============================================================

function get_deliveries_dialog(frm) {
	// Step 1: Ask for customer
	let d = new frappe.ui.Dialog({
		title: __('Get Deliveries - Select Customer'),
		fields: [
			{
				fieldtype: 'Link',
				fieldname: 'customer',
				label: 'Customer',
				options: 'Customer',
				reqd: 1
			}
		],
		primary_action_label: __('Show Pending Items'),
		primary_action: function() {
			let customer = d.get_value('customer');
			if (!customer) {
				frappe.msgprint(__('Please select a customer.'));
				return;
			}
			d.hide();
			load_pending_items_for_dispatch(frm, customer);
		}
	});
	d.show();
}

function load_pending_items_for_dispatch(frm, customer) {
	// 3 parallel API calls
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deal_items',
		args: { customer: customer },
		async: false,
		callback: function() {}
	});

	let pending_items = null;
	let pack_sizes = null;
	let bag_cost_map = null;
	let calls_done = 0;

	function check_all_done() {
		calls_done++;
		if (calls_done === 3) {
			if (!pending_items || pending_items.length === 0) {
				frappe.msgprint(__('No pending deal items found for this customer.'));
				return;
			}
			show_dispatch_items_dialog(frm, customer, pending_items, pack_sizes, bag_cost_map);
		}
	}

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pending_deal_items',
		args: { customer: customer },
		callback: function(r) {
			pending_items = r.message || [];
			check_all_done();
		}
	});

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_pack_sizes',
		callback: function(r) {
			pack_sizes = r.message || [];
			check_all_done();
		}
	});

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_delivery.deal_delivery.get_bag_cost_map',
		callback: function(r) {
			bag_cost_map = r.message || {};
			check_all_done();
		}
	});
}

function show_dispatch_items_dialog(frm, customer, pending_items, pack_sizes, bag_cost_map) {
	// Build pack_weight_map
	let pack_weight_map = {};
	pack_sizes.forEach(function(ps) {
		pack_weight_map[ps.pack_size] = flt(ps.weight_kg);
	});

	// Build pack size dropdown options HTML
	let pack_options_html = '';
	pack_sizes.forEach(function(ps) {
		pack_options_html += '<option value="' + ps.pack_size + '">' + ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
	});

	// Build row state from pending items — all pre-checked with full pending qty
	let rows = [];
	pending_items.forEach(function(p, idx) {
		let bc = flt(bag_cost_map[p.item + ':' + p.pack_size]);
		let ppk = flt(p.price_per_kg);
		if (ppk <= 0 && flt(p.rate) > 0 && flt(p.pack_weight_kg) > 0) {
			ppk = (flt(p.rate) - bc) / flt(p.pack_weight_kg);
		}

		rows.push({
			idx: idx,
			deal_name: p.deal_name,
			deal_item_name: p.deal_item_name,
			soda_date: p.soda_date,
			item: p.item,
			item_name: p.item_name,
			pack_size: p.pack_size,
			original_pack_size: p.pack_size,
			pack_weight_kg: flt(p.pack_weight_kg),
			original_pack_weight_kg: flt(p.pack_weight_kg),
			pending_kg: flt(p.pending_kg),
			pending_qty: flt(p.pending_qty),
			price_per_kg: ppk,
			deliver_qty: flt(p.pending_qty),
			bag_cost: bc,
			rate: flt(p.rate),
			checked: true
		});
	});

	let capacity = flt(frm.doc.vehicle_capacity_kg);
	let already_loaded = flt(frm.doc.total_loaded_kg);

	let d = new frappe.ui.Dialog({
		title: __('Select Items for Vehicle'),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'dialog_content'
			}
		],
		primary_action_label: __('Add to Vehicle'),
		primary_action: function() {
			add_items_to_vehicle(frm, customer, rows, d);
		}
	});

	// Customer badge on title
	let customer_name = '';
	// Fetch customer_name from first pending item
	if (pending_items.length > 0 && pending_items[0].customer_name) {
		customer_name = pending_items[0].customer_name;
	}
	d.$wrapper.find('.modal-title').append(
		' <span style="background:#e8f4fd;color:#1565c0;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500;margin-left:8px;">'
		+ (customer_name || customer) + '</span>'
	);

	let wrapper = d.fields_dict.dialog_content.$wrapper;
	wrapper.css('min-height', '300px');

	function render_table() {
		let html = '';

		// Info bar
		html += '<div style="font-size:11px;color:#718096;padding:6px 10px;margin-bottom:10px;background:#f0fff4;border-left:3px solid #38a169;border-radius:4px;">'
			+ 'All items pre-selected with full pending qty. Change <b>Pack Size</b> if loading different packs. Adjust <b>Deliver Qty</b> as needed.'
			+ '</div>';

		// Table
		html += '<div style="max-height:380px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;">';
		html += '<table class="table table-sm" style="margin-bottom:0;font-size:12px;">';
		html += '<thead style="background:#f7fafc;position:sticky;top:0;z-index:1;">';
		html += '<tr>';
		html += '<th style="width:30px;text-align:center;padding:7px 3px;font-size:10px;">SEL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">DEAL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">ITEM</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">PENDING KG</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">PACK SIZE</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">WT</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">BAG COST</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;width:75px;">DELIVER QTY</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">RATE</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">AMOUNT</th>';
		html += '</tr></thead><tbody>';

		rows.forEach(function(row) {
			let amount = flt(row.deliver_qty) * flt(row.rate);
			let pack_changed = row.pack_size && row.pack_size !== row.original_pack_size;
			let row_bg = '';
			if (row.checked && pack_changed) row_bg = 'background:#fffff0;';
			else if (row.checked) row_bg = 'background:#f0fff4;';

			html += '<tr style="' + row_bg + '" data-idx="' + row.idx + '">';

			// Checkbox
			html += '<td style="text-align:center;vertical-align:middle;padding:5px 3px;">'
				+ '<input type="checkbox" class="row-check" data-idx="' + row.idx + '" '
				+ (row.checked ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;">'
				+ '</td>';

			// Deal
			html += '<td style="vertical-align:middle;padding:5px;font-size:11px;">'
				+ '<span style="font-weight:600;color:#2b6cb0;">' + row.deal_name + '</span>'
				+ '<br><span style="color:#a0aec0;font-size:10px;">' + frappe.datetime.str_to_user(row.soda_date) + '</span>'
				+ '</td>';

			// Item
			html += '<td style="vertical-align:middle;padding:5px;font-weight:500;">'
				+ (row.item_name || row.item) + '</td>';

			// Pending KG
			html += '<td class="remaining-cell" data-row-idx="' + row.idx + '" style="text-align:right;vertical-align:middle;padding:5px;font-weight:600;color:#805ad5;">'
				+ row.pending_kg.toFixed(2) + '</td>';

			// Pack Size (dropdown)
			let pack_select = '<select class="pack-select" data-idx="' + row.idx + '" '
				+ 'style="padding:4px 5px;border:1px solid ' + (pack_changed ? '#d69e2e' : '#cbd5e0') + ';border-radius:4px;font-size:11.5px;min-width:90px;'
				+ (pack_changed ? 'font-weight:600;background:#fffff0;' : '') + '">';
			pack_sizes.forEach(function(ps) {
				pack_select += '<option value="' + ps.pack_size + '"'
					+ (row.pack_size === ps.pack_size ? ' selected' : '') + '>'
					+ ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
			});
			pack_select += '</select>';
			html += '<td style="vertical-align:middle;padding:5px;">' + pack_select;
			if (pack_changed) {
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

			html += '</tr>';
		});

		html += '</tbody></table></div>';

		// Footer summary
		let summary = get_vd_dialog_summary(rows);
		html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:8px 0;">';
		html += '<div class="dialog-footer-summary" style="display:flex;gap:20px;font-size:12.5px;color:#4a5568;">';
		html += '<div>Selected: <strong>' + summary.selected + '</strong> of ' + rows.length + '</div>';
		html += '<div>Packs: <strong>' + summary.total_qty + '</strong></div>';
		html += '<div>KG: <strong>' + summary.total_kg.toFixed(2) + '</strong></div>';
		html += '<div>Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
		if (capacity) {
			let remaining_cap = capacity - already_loaded - summary.total_kg;
			let cap_color = remaining_cap < 0 ? '#e53e3e' : '#38a169';
			html += '<div>Remaining Capacity: <strong style="color:' + cap_color + ';">' + remaining_cap.toFixed(0) + ' KG</strong></div>';
		}
		html += '</div></div>';

		wrapper.html(html);

		// Bind events
		bind_dispatch_events(wrapper, rows, pack_weight_map, bag_cost_map, pack_sizes, capacity, already_loaded, render_table);
	}

	render_table();
	d.show();
	d.$wrapper.find('.modal-dialog').css('max-width', '1100px');
}

function bind_dispatch_events(wrapper, rows, pack_weight_map, bag_cost_map, pack_sizes, capacity, already_loaded, render_table) {
	// Checkbox
	wrapper.find('.row-check').off('change').on('change', function() {
		let idx = parseInt($(this).data('idx'));
		let row = rows[idx];
		if (row) {
			row.checked = $(this).is(':checked');
			if (!row.checked) {
				row.deliver_qty = 0;
			} else {
				row.deliver_qty = calc_vd_packs_remaining(row);
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

			// Auto-convert deliver_qty to match pending KG
			row.deliver_qty = calc_vd_packs_remaining(row);

			if (!row.checked) row.checked = true;
			render_table();
		}
	});

	// Deliver qty — real-time update with validation
	wrapper.find('.deliver-input').off('input').on('input', function() {
		let idx = parseInt($(this).data('idx'));
		let val = parseFloat($(this).val()) || 0;
		let row = rows[idx];
		if (!row) return;
		if (val < 0) val = 0;

		// Cap by available KG
		let available_kg = flt(row.pending_kg);
		let delivering_kg = val * flt(row.pack_weight_kg);

		if (flt(row.pack_weight_kg) > 0 && delivering_kg > available_kg + 1) {
			let max_packs = Math.floor(available_kg / flt(row.pack_weight_kg));
			if (max_packs < 0) max_packs = 0;
			val = max_packs;
			$(this).val(val);
			frappe.show_alert({
				message: __('Max {0} packs ({1} KG available)', [max_packs, available_kg.toFixed(2)]),
				indicator: 'orange'
			}, 3);
		}

		row.deliver_qty = val;
		if (val > 0) row.checked = true;

		// Update amount cell
		let amount = flt(row.deliver_qty) * flt(row.rate);
		let $amt = wrapper.find('.amount-cell[data-row-idx="' + idx + '"]');
		$amt.html(amount > 0 ? format_number(amount) : '--');
		$amt.css({'font-weight': amount > 0 ? '600' : '', 'color': amount > 0 ? '' : '#718096'});

		// Update footer
		let summary = get_vd_dialog_summary(rows);
		let footer_html = '<div>Selected: <strong>' + summary.selected + '</strong> of ' + rows.length + '</div>'
			+ '<div>Packs: <strong>' + summary.total_qty + '</strong></div>'
			+ '<div>KG: <strong>' + summary.total_kg.toFixed(2) + '</strong></div>'
			+ '<div>Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
		if (capacity) {
			let remaining_cap = capacity - already_loaded - summary.total_kg;
			let cap_color = remaining_cap < 0 ? '#e53e3e' : '#38a169';
			footer_html += '<div>Remaining Capacity: <strong style="color:' + cap_color + ';">' + remaining_cap.toFixed(0) + ' KG</strong></div>';
		}
		wrapper.find('.dialog-footer-summary').html(footer_html);
	});

	// Re-render on blur
	wrapper.find('.deliver-input').off('change').on('change', function() {
		render_table();
	});
}

function calc_vd_packs_remaining(row) {
	if (flt(row.pack_weight_kg) <= 0) return 0;
	let remaining_kg = flt(row.pending_kg);
	if (remaining_kg <= 0) return 0;
	return Math.floor(remaining_kg / flt(row.pack_weight_kg));
}

function get_vd_dialog_summary(rows) {
	let selected = 0;
	let total_qty = 0;
	let total_kg = 0;
	let total_amount = 0;

	rows.forEach(function(row) {
		if (row.checked && row.deliver_qty > 0) {
			selected++;
			total_qty += flt(row.deliver_qty);
			total_kg += flt(row.deliver_qty) * flt(row.pack_weight_kg);
			total_amount += flt(row.deliver_qty) * flt(row.rate);
		}
	});

	return {
		selected: selected,
		total_qty: total_qty,
		total_kg: total_kg,
		total_amount: total_amount
	};
}

function add_items_to_vehicle(frm, customer, rows, dialog) {
	let items_to_send = [];

	rows.forEach(function(row) {
		if (!row.checked || !row.deliver_qty || row.deliver_qty <= 0) return;

		items_to_send.push({
			soda: row.deal_name,
			deal_item: row.deal_item_name,
			item: row.item,
			pack_size: row.pack_size,
			pack_weight_kg: row.pack_weight_kg,
			deliver_qty: row.deliver_qty,
			bag_cost: row.bag_cost,
			rate: row.rate
		});
	});

	if (items_to_send.length === 0) {
		frappe.msgprint(__('No items selected. Please check items and enter delivery qty.'));
		return;
	}

	// Group items by Deal (soda) — one DD per Deal → one VDI row per Deal
	let deal_groups = {};
	items_to_send.forEach(function(item) {
		let deal = item.soda || '_no_deal';
		if (!deal_groups[deal]) deal_groups[deal] = [];
		deal_groups[deal].push(item);
	});

	// Build pending entries — one per Deal
	let pending = [];
	try {
		pending = JSON.parse(frm.doc._pending_auto_deliveries || '[]');
	} catch(e) {
		pending = [];
	}
	Object.keys(deal_groups).forEach(function(deal_key) {
		pending.push({
			customer: customer,
			items: deal_groups[deal_key]
		});
	});
	frm.doc._pending_auto_deliveries = JSON.stringify(pending);

	// Add placeholder VDI rows per Deal (replaced on save by server)
	Object.keys(deal_groups).forEach(function(deal_key) {
		let group_items = deal_groups[deal_key];
		let total_kg = 0;
		let total_packs = 0;
		let total_amount = 0;
		group_items.forEach(function(item) {
			total_packs += flt(item.deliver_qty);
			total_kg += flt(item.deliver_qty) * flt(item.pack_weight_kg);
			total_amount += flt(item.deliver_qty) * flt(item.rate);
		});

		let row = frm.add_child('deliveries');
		row.customer = customer;
		row.delivery_date = frm.doc.dispatch_date;
		row.total_packs = total_packs;
		row.total_kg = total_kg;
		row.total_amount = total_amount;
		row.loaded_kg = total_kg;
	});

	frm.refresh_field('deliveries');
	dialog.hide();

	// Auto-save immediately — DDs created in before_save on server
	let deal_count = Object.keys(deal_groups).length;
	frappe.show_alert({
		message: __('Creating {0} delivery record(s)...', [deal_count]),
		indicator: 'blue'
	}, 3);

	frm.save().then(function() {
		frappe.show_alert({
			message: __('Deliveries created and added to vehicle.'),
			indicator: 'green'
		}, 5);
		render_capacity_bar(frm);
	});
}


// ============================================================
// Link Existing Delivery (OLD flow — renamed)
// ============================================================

function link_existing_delivery_dialog(frm) {
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.vehicle_dispatch.vehicle_dispatch.get_available_deliveries',
		args: { exclude_dispatch: frm.doc.name },
		freeze: true,
		freeze_message: __('Loading deliveries...'),
		callback: function(r) {
			if (!r.message || r.message.length === 0) {
				frappe.msgprint(__('No available deliveries found.'));
				return;
			}
			show_existing_deliveries_dialog(frm, r.message);
		}
	});
}

function show_existing_deliveries_dialog(frm, deliveries) {
	let capacity = flt(frm.doc.vehicle_capacity_kg);
	let already_loaded = flt(frm.doc.total_loaded_kg);

	// Build table HTML
	let table_html = '<div style="max-height:400px;overflow-y:auto;">';
	table_html += '<table class="table table-bordered table-sm" style="font-size:12px;">';
	table_html += '<thead><tr style="background:#f5f5f5;">';
	table_html += '<th style="width:30px;"><input type="checkbox" class="check-all"></th>';
	table_html += '<th>Delivery</th><th>Customer</th><th>Date</th>';
	table_html += '<th style="text-align:right;">Packs</th>';
	table_html += '<th style="text-align:right;">DD Total KG</th>';
	table_html += '<th style="text-align:right;">Remaining KG</th>';
	table_html += '<th style="width:120px;">Load KG</th>';
	table_html += '<th style="text-align:right;">Amount</th>';
	table_html += '</tr></thead><tbody>';

	deliveries.forEach(function(d, idx) {
		let remaining = flt(d.remaining_kg);
		table_html += '<tr>';
		table_html += '<td><input type="checkbox" class="delivery-check" data-idx="' + idx + '"></td>';
		table_html += '<td>' + d.name + '</td>';
		table_html += '<td>' + (d.customer_name || d.customer) + '</td>';
		table_html += '<td>' + d.delivery_date + '</td>';
		table_html += '<td style="text-align:right;">' + flt(d.total_packs) + '</td>';
		table_html += '<td style="text-align:right;">' + flt(d.total_kg).toFixed(2) + '</td>';
		table_html += '<td style="text-align:right;color:#38a169;font-weight:bold;">' + remaining.toFixed(2) + '</td>';
		table_html += '<td><input type="number" class="form-control input-sm load-kg-input" data-idx="' + idx + '" value="' + remaining.toFixed(2) + '" min="0" max="' + remaining.toFixed(2) + '" step="0.01" style="width:110px;text-align:right;"></td>';
		table_html += '<td style="text-align:right;">' + format_currency(flt(d.total_amount)) + '</td>';
		table_html += '</tr>';
	});

	table_html += '</tbody></table></div>';

	// Footer with summary
	let remaining_cap = capacity - already_loaded;
	table_html += '<div class="delivery-footer" style="padding:8px;background:#f8f9fa;border-radius:4px;margin-top:8px;">';
	table_html += '<span>Selected: <b class="selected-count">0</b></span>';
	table_html += ' &nbsp;|&nbsp; Load KG: <b class="selected-kg">0</b>';
	if (capacity) {
		table_html += ' &nbsp;|&nbsp; Remaining Capacity: <b class="remaining-cap">' + remaining_cap.toFixed(0) + '</b> KG';
	}
	table_html += '</div>';

	let d = new frappe.ui.Dialog({
		title: __('Link Existing Deliveries'),
		size: 'extra-large',
		fields: [
			{fieldtype: 'HTML', fieldname: 'deliveries_html'}
		],
		primary_action_label: __('Add Selected'),
		primary_action: function() {
			let selected = [];
			d.$wrapper.find('.delivery-check:checked').each(function() {
				let idx = $(this).data('idx');
				let load_kg = parseFloat(d.$wrapper.find('.load-kg-input[data-idx="' + idx + '"]').val()) || 0;
				if (load_kg > 0) {
					selected.push({
						delivery: deliveries[idx],
						load_kg: load_kg
					});
				}
			});

			if (selected.length === 0) {
				frappe.msgprint(__('Please select at least one delivery.'));
				return;
			}

			// Add to child table
			selected.forEach(function(s) {
				let del = s.delivery;
				let row = frm.add_child('deliveries');
				row.deal_delivery = del.name;
				row.customer = del.customer;
				row.customer_name = del.customer_name;
				row.delivery_date = del.delivery_date;
				row.total_packs = flt(del.total_packs);
				row.total_kg = flt(del.total_kg);
				row.total_amount = flt(del.total_amount);
				row.loaded_kg = s.load_kg;
				// loaded_amount calculated in before_save
			});

			frm.refresh_field('deliveries');
			frm.dirty();
			d.hide();
		}
	});

	d.fields_dict.deliveries_html.$wrapper.html(table_html);

	// Check-all handler
	d.$wrapper.find('.check-all').on('change', function() {
		let checked = $(this).prop('checked');
		d.$wrapper.find('.delivery-check').prop('checked', checked).trigger('change');
	});

	// Update footer on checkbox change or load kg change
	function update_footer() {
		let total_kg = 0;
		let count = 0;
		d.$wrapper.find('.delivery-check:checked').each(function() {
			let idx = $(this).data('idx');
			let load_val = parseFloat(d.$wrapper.find('.load-kg-input[data-idx="' + idx + '"]').val()) || 0;
			total_kg += load_val;
			count++;
		});
		d.$wrapper.find('.selected-count').text(count);
		d.$wrapper.find('.selected-kg').text(total_kg.toFixed(2));
		if (capacity) {
			let rem = remaining_cap - total_kg;
			let $cap = d.$wrapper.find('.remaining-cap');
			$cap.text(rem.toFixed(0));
			$cap.css('color', rem < 0 ? '#e53e3e' : '#38a169');
		}
	}

	d.$wrapper.on('change', '.delivery-check', update_footer);
	d.$wrapper.on('input', '.load-kg-input', update_footer);

	d.show();
}

function flt(val) {
	return parseFloat(val) || 0;
}
