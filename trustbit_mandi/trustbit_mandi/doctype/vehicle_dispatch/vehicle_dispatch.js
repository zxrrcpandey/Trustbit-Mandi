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
		}
	},

	vehicle: function(frm) {
		// Recalculate capacity bar when vehicle changes
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
// Get Deliveries Dialog
// ============================================================

function get_deliveries_dialog(frm) {
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
			show_deliveries_dialog(frm, r.message);
		}
	});
}

function show_deliveries_dialog(frm, deliveries) {
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
		title: __('Select Deliveries to Load'),
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
