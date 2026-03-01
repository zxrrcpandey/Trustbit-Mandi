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

		render_capacity_bar(frm);

		// "Get Deliveries" button only in draft mode
		if (frm.doc.docstatus === 0) {
			frm.add_custom_button(__('Get Deliveries'), function() {
				get_deliveries_dialog(frm);
			}).addClass('btn-primary');
		}

		// "Petrol Coupon" print button on saved forms
		if (!frm.is_new()) {
			frm.add_custom_button(__('Petrol Coupon'), function() {
				window.open(
					frappe.urllib.get_full_url(
						'/printview?doctype=Vehicle Dispatch'
						+ '&name=' + encodeURIComponent(frm.doc.name)
						+ '&format=Petrol Coupon'
						+ '&no_letterhead=1'
					),
					'_blank'
				);
			}, __('Print'));
		}
	},

	vehicle: function(frm) {
		setTimeout(function() {
			render_capacity_bar(frm);
		}, 500);
	},

	freight_amount: function(frm) {
		calculate_freight_balance(frm);
	}
});

frappe.ui.form.on('Vehicle Dispatch Payment', {
	amount: function(frm) {
		calculate_freight_balance(frm);
	},
	payments_remove: function(frm) {
		calculate_freight_balance(frm);
	}
});

frappe.ui.form.on('Vehicle Dispatch Load Item', {
	qty: function(frm, cdt, cdn) {
		recalc_load_item_row(frm, cdt, cdn);
	},
	rate: function(frm, cdt, cdn) {
		recalc_load_item_row(frm, cdt, cdn);
	},
	load_items_remove: function(frm) {
		recalc_totals_from_items(frm);
	}
});

frappe.ui.form.on('Vehicle Dispatch Customer Payment', {
	paying_amount: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		let invoice_amt = flt(row.invoice_amount);
		row.balance_amount = invoice_amt - flt(row.paying_amount);
		frm.refresh_field('customer_payments');
	},
	customer_payments_remove: function(frm) {
		frm.refresh_field('customer_payments');
	}
});


// ============================================================
// Row-level recalculation
// ============================================================

function recalc_load_item_row(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	row.kg = flt(row.qty) * flt(row.pack_weight_kg);
	row.amount = flt(row.qty) * flt(row.rate);
	frm.refresh_field('load_items');
	recalc_totals_from_items(frm);
}

function recalc_totals_from_items(frm) {
	let total_kg = 0, total_packs = 0, total_amount = 0;
	let customers = new Set();
	(frm.doc.load_items || []).forEach(function(row) {
		total_kg += flt(row.kg);
		total_packs += flt(row.qty);
		total_amount += flt(row.amount);
		if (row.customer) customers.add(row.customer);
	});
	frm.set_value('total_loaded_kg', total_kg);
	frm.set_value('total_packs', total_packs);
	frm.set_value('total_amount', total_amount);
	frm.set_value('total_customers', customers.size);
	frm.set_value('remaining_capacity_kg', flt(frm.doc.vehicle_capacity_kg) - total_kg);
	if (flt(frm.doc.vehicle_capacity_kg)) {
		frm.set_value('capacity_utilization', (total_kg / flt(frm.doc.vehicle_capacity_kg)) * 100);
	}
	render_capacity_bar(frm);
	update_customer_payment_amounts(frm);
}

function update_customer_payment_amounts(frm) {
	// Recalculate invoice_amount for each customer payment row
	let customer_amounts = {};
	(frm.doc.load_items || []).forEach(function(row) {
		if (row.customer) {
			customer_amounts[row.customer] = (customer_amounts[row.customer] || 0) + flt(row.amount);
		}
	});
	(frm.doc.customer_payments || []).forEach(function(row) {
		row.invoice_amount = flt(customer_amounts[row.customer] || 0);
		row.balance_amount = flt(row.invoice_amount) - flt(row.paying_amount);
	});
	frm.refresh_field('customer_payments');
}


// ============================================================
// Freight Payment Helpers
// ============================================================

function calculate_freight_balance(frm) {
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
// Get Deliveries Dialog — Area / Customer filter
// ============================================================

function get_deliveries_dialog(frm) {
	let d = new frappe.ui.Dialog({
		title: __('Get Deliveries'),
		fields: [
			{
				fieldtype: 'Select',
				fieldname: 'filter_by',
				label: 'Filter By',
				options: 'Area\nCustomer',
				default: 'Area',
				change: function() {
					let val = d.get_value('filter_by');
					d.set_df_property('price_list_area', 'hidden', val !== 'Area');
					d.set_df_property('customer', 'hidden', val !== 'Customer');
					d.set_df_property('price_list_area', 'reqd', val === 'Area');
					d.set_df_property('customer', 'reqd', val === 'Customer');
				}
			},
			{
				fieldtype: 'Link',
				fieldname: 'price_list_area',
				label: 'Area',
				options: 'Deal Price List Area',
				reqd: 1
			},
			{
				fieldtype: 'Link',
				fieldname: 'customer',
				label: 'Customer',
				options: 'Customer',
				hidden: 1
			}
		],
		primary_action_label: __('Show Pending Items'),
		primary_action: function() {
			let filter_by = d.get_value('filter_by');
			let area = filter_by === 'Area' ? d.get_value('price_list_area') : null;
			let customer = filter_by === 'Customer' ? d.get_value('customer') : null;

			if (!area && !customer) {
				frappe.msgprint(__('Please select an Area or Customer.'));
				return;
			}
			d.hide();
			load_pending_items_for_dispatch(frm, area, customer);
		}
	});
	d.show();
}

function load_pending_items_for_dispatch(frm, area, customer) {
	let pending_items = null;
	let pack_sizes = null;
	let bag_cost_map = null;
	let calls_done = 0;

	function check_all_done() {
		calls_done++;
		if (calls_done === 3) {
			if (!pending_items || pending_items.length === 0) {
				frappe.msgprint(__('No pending deal items found.'));
				return;
			}
			show_dispatch_items_dialog(frm, pending_items, pack_sizes, bag_cost_map);
		}
	}

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.vehicle_dispatch.vehicle_dispatch.get_pending_items_for_dispatch',
		args: { price_list_area: area, customer: customer },
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

function show_dispatch_items_dialog(frm, pending_items, pack_sizes, bag_cost_map) {
	let pack_weight_map = {};
	pack_sizes.forEach(function(ps) {
		pack_weight_map[ps.pack_size] = flt(ps.weight_kg);
	});

	// Group items by customer for display
	let customer_groups = {};
	pending_items.forEach(function(p) {
		let cust = p.customer || '_unknown';
		if (!customer_groups[cust]) {
			customer_groups[cust] = {
				customer: p.customer,
				customer_name: p.customer_name,
				items: []
			};
		}
		customer_groups[cust].items.push(p);
	});

	// Build row state
	let rows = [];
	let row_idx = 0;
	Object.keys(customer_groups).forEach(function(cust) {
		let group = customer_groups[cust];
		group.items.forEach(function(p) {
			let bc = flt(bag_cost_map[p.item + ':' + p.pack_size]);
			let ppk = flt(p.price_per_kg);
			if (ppk <= 0 && flt(p.rate) > 0 && flt(p.pack_weight_kg) > 0) {
				ppk = (flt(p.rate) - bc) / flt(p.pack_weight_kg);
			}

			rows.push({
				idx: row_idx++,
				customer: p.customer,
				customer_name: p.customer_name,
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
				pending_packs: flt(p.pending_packs),
				price_per_kg: ppk,
				deliver_qty: Math.floor(flt(p.pending_packs)),
				bag_cost: bc,
				rate: flt(p.rate),
				checked: true
			});
		});
	});

	let capacity = flt(frm.doc.vehicle_capacity_kg);
	let already_loaded = flt(frm.doc.total_loaded_kg);

	let d = new frappe.ui.Dialog({
		title: __('Select Items for Vehicle'),
		size: 'extra-large',
		fields: [
			{ fieldtype: 'HTML', fieldname: 'dialog_content' }
		],
		primary_action_label: __('Add to Vehicle'),
		primary_action: function() {
			add_items_to_vehicle(frm, rows, d);
		}
	});

	let wrapper = d.fields_dict.dialog_content.$wrapper;
	wrapper.css('min-height', '300px');

	function render_table() {
		let html = '';

		// Info bar
		html += '<div style="font-size:11px;color:#718096;padding:6px 10px;margin-bottom:10px;background:#f0fff4;border-left:3px solid #38a169;border-radius:4px;">'
			+ 'All items pre-selected with full pending qty. Change <b>Pack Size</b> or adjust <b>Qty</b> as needed. Uncheck items to exclude.'
			+ '</div>';

		// Table
		html += '<div style="max-height:400px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;">';
		html += '<table class="table table-sm" style="margin-bottom:0;font-size:12px;">';
		html += '<thead style="background:#f7fafc;position:sticky;top:0;z-index:1;">';
		html += '<tr>';
		html += '<th style="width:30px;text-align:center;padding:7px 3px;font-size:10px;">SEL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">CUSTOMER</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">DEAL</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">ITEM</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">PENDING KG</th>';
		html += '<th style="padding:7px 5px;font-size:10px;">PACK SIZE</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">BAG COST</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;width:75px;">QTY</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">RATE</th>';
		html += '<th style="text-align:right;padding:7px 5px;font-size:10px;">AMOUNT</th>';
		html += '</tr></thead><tbody>';

		// Render grouped by customer
		let current_customer = null;
		rows.forEach(function(row) {
			// Customer header row
			if (row.customer !== current_customer) {
				current_customer = row.customer;
				html += '<tr style="background:#edf2f7;">';
				html += '<td colspan="10" style="padding:6px 10px;font-weight:700;font-size:12px;color:#2d3748;">'
					+ (row.customer_name || row.customer)
					+ '</td></tr>';
			}

			let amount = flt(row.deliver_qty) * flt(row.rate);
			let pack_changed = row.pack_size !== row.original_pack_size;
			let row_bg = '';
			if (row.checked && pack_changed) row_bg = 'background:#fffff0;';
			else if (row.checked) row_bg = 'background:#f0fff4;';

			html += '<tr style="' + row_bg + '" data-idx="' + row.idx + '">';

			// Checkbox
			html += '<td style="text-align:center;vertical-align:middle;padding:5px 3px;">'
				+ '<input type="checkbox" class="row-check" data-idx="' + row.idx + '" '
				+ (row.checked ? 'checked' : '') + ' style="width:15px;height:15px;cursor:pointer;">'
				+ '</td>';

			// Customer (empty for grouped display, shown in header)
			html += '<td style="vertical-align:middle;padding:5px;font-size:11px;color:#718096;">'
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
			html += '<td style="text-align:right;vertical-align:middle;padding:5px;font-weight:600;color:#805ad5;">'
				+ row.pending_kg.toFixed(2) + '</td>';

			// Pack Size dropdown
			let ps_html = '<select class="pack-select" data-idx="' + row.idx + '" '
				+ 'style="padding:4px 5px;border:1px solid ' + (pack_changed ? '#d69e2e' : '#cbd5e0') + ';border-radius:4px;font-size:11.5px;min-width:90px;'
				+ (pack_changed ? 'font-weight:600;background:#fffff0;' : '') + '">';
			pack_sizes.forEach(function(ps) {
				ps_html += '<option value="' + ps.pack_size + '"'
					+ (row.pack_size === ps.pack_size ? ' selected' : '') + '>'
					+ ps.pack_size + ' (' + ps.weight_kg + ' KG)</option>';
			});
			ps_html += '</select>';
			html += '<td style="vertical-align:middle;padding:5px;">' + ps_html;
			if (pack_changed) {
				html += '<br><span style="font-size:9px;color:#a0aec0;">was: ' + row.original_pack_size + '</span>';
			}
			html += '</td>';

			// Bag Cost
			html += '<td style="text-align:right;vertical-align:middle;padding:5px;color:#718096;font-size:11px;">'
				+ (flt(row.bag_cost) > 0 ? format_number(row.bag_cost) : '--') + '</td>';

			// Qty (editable)
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
		html += '<div>Customers: <strong>' + summary.customers + '</strong></div>';
		html += '<div>Packs: <strong>' + summary.total_qty + '</strong></div>';
		html += '<div>KG: <strong>' + summary.total_kg.toFixed(2) + '</strong></div>';
		html += '<div>Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
		if (capacity) {
			let remaining_cap = capacity - already_loaded - summary.total_kg;
			let cap_color = remaining_cap < 0 ? '#e53e3e' : '#38a169';
			html += '<div>Remaining: <strong style="color:' + cap_color + ';">' + remaining_cap.toFixed(0) + ' KG</strong></div>';
		}
		html += '</div></div>';

		wrapper.html(html);
		bind_dispatch_events(wrapper, rows, pack_weight_map, bag_cost_map, pack_sizes, capacity, already_loaded, render_table);
	}

	render_table();
	d.show();
	d.$wrapper.find('.modal-dialog').css('max-width', '1150px');
}


// ============================================================
// Dialog Event Handlers
// ============================================================

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

			let bc = flt(bag_cost_map[row.item + ':' + new_pack]);
			row.bag_cost = bc;
			row.rate = (flt(row.price_per_kg) * flt(row.pack_weight_kg)) + bc;

			row.deliver_qty = calc_vd_packs_remaining(row);
			if (!row.checked) row.checked = true;
			render_table();
		}
	});

	// Deliver qty input
	wrapper.find('.deliver-input').off('input').on('input', function() {
		let idx = parseInt($(this).data('idx'));
		let val = parseFloat($(this).val()) || 0;
		let row = rows[idx];
		if (!row) return;
		if (val < 0) val = 0;

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
		update_dialog_footer(wrapper, rows, capacity, already_loaded);
	});

	wrapper.find('.deliver-input').off('change').on('change', function() {
		render_table();
	});
}


// ============================================================
// Add Items to Vehicle (from dialog to child table)
// ============================================================

function add_items_to_vehicle(frm, rows, dialog) {
	let items_to_add = [];
	rows.forEach(function(row) {
		if (!row.checked || !row.deliver_qty || row.deliver_qty <= 0) return;
		items_to_add.push(row);
	});

	if (items_to_add.length === 0) {
		frappe.msgprint(__('No items selected. Please check items and enter qty.'));
		return;
	}

	// Add to load_items child table
	items_to_add.forEach(function(row) {
		let child = frm.add_child('load_items');
		child.customer = row.customer;
		child.customer_name = row.customer_name;
		child.soda = row.deal_name;
		child.deal_item = row.deal_item_name;
		child.item = row.item;
		child.pack_size = row.pack_size;
		child.pack_weight_kg = row.pack_weight_kg;
		child.qty = row.deliver_qty;
		child.kg = flt(row.deliver_qty) * flt(row.pack_weight_kg);
		child.price_per_kg = row.price_per_kg;
		child.bag_cost = row.bag_cost;
		child.rate = row.rate;
		child.amount = flt(row.deliver_qty) * flt(row.rate);
	});

	frm.refresh_field('load_items');

	// Auto-populate customer_payments for new customers
	let existing_customers = new Set();
	(frm.doc.customer_payments || []).forEach(function(row) {
		existing_customers.add(row.customer);
	});

	let new_customers = new Set();
	items_to_add.forEach(function(row) {
		if (!existing_customers.has(row.customer)) {
			new_customers.add(row.customer);
		}
	});

	new_customers.forEach(function(cust) {
		let cp = frm.add_child('customer_payments');
		cp.customer = cust;
		// customer_name will be fetched
		let cust_item = items_to_add.find(function(r) { return r.customer === cust; });
		if (cust_item) {
			cp.customer_name = cust_item.customer_name;
		}
		cp.payment_mode = 'Cash';
	});

	frm.refresh_field('customer_payments');
	frm.dirty();

	// Recalculate totals
	recalc_totals_from_items(frm);

	dialog.hide();

	let customer_count = new Set(items_to_add.map(function(r) { return r.customer; })).size;
	frappe.show_alert({
		message: __('{0} items added for {1} customer(s). Save to continue.', [items_to_add.length, customer_count]),
		indicator: 'green'
	}, 5);
}


// ============================================================
// Helper functions
// ============================================================

function calc_vd_packs_remaining(row) {
	if (flt(row.pack_weight_kg) <= 0) return 0;
	let remaining_kg = flt(row.pending_kg);
	if (remaining_kg <= 0) return 0;
	return Math.floor(remaining_kg / flt(row.pack_weight_kg));
}

function get_vd_dialog_summary(rows) {
	let selected = 0, total_qty = 0, total_kg = 0, total_amount = 0;
	let customers = new Set();

	rows.forEach(function(row) {
		if (row.checked && row.deliver_qty > 0) {
			selected++;
			total_qty += flt(row.deliver_qty);
			total_kg += flt(row.deliver_qty) * flt(row.pack_weight_kg);
			total_amount += flt(row.deliver_qty) * flt(row.rate);
			customers.add(row.customer);
		}
	});

	return {
		selected: selected,
		customers: customers.size,
		total_qty: total_qty,
		total_kg: total_kg,
		total_amount: total_amount
	};
}

function update_dialog_footer(wrapper, rows, capacity, already_loaded) {
	let summary = get_vd_dialog_summary(rows);
	let footer_html = '<div>Selected: <strong>' + summary.selected + '</strong> of ' + rows.length + '</div>'
		+ '<div>Customers: <strong>' + summary.customers + '</strong></div>'
		+ '<div>Packs: <strong>' + summary.total_qty + '</strong></div>'
		+ '<div>KG: <strong>' + summary.total_kg.toFixed(2) + '</strong></div>'
		+ '<div>Amount: <strong>&#8377; ' + format_number(summary.total_amount) + '</strong></div>';
	if (capacity) {
		let remaining_cap = capacity - already_loaded - summary.total_kg;
		let cap_color = remaining_cap < 0 ? '#e53e3e' : '#38a169';
		footer_html += '<div>Remaining: <strong style="color:' + cap_color + ';">' + remaining_cap.toFixed(0) + ' KG</strong></div>';
	}
	wrapper.find('.dialog-footer-summary').html(footer_html);
}

function format_number(num) {
	return parseFloat(num || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function flt(val) {
	return parseFloat(val) || 0;
}
