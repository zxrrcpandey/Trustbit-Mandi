frappe.ui.form.on('Mandi Stock Entry', {
	refresh: function(frm) {
		// Custom status indicators
		if (frm.doc.docstatus === 0) {
			frm.page.set_indicator(__('Draft'), 'orange');
		} else if (frm.doc.docstatus === 1) {
			frm.page.set_indicator(__('Submitted'), 'blue');
		} else if (frm.doc.docstatus === 2) {
			frm.page.set_indicator(__('Cancelled'), 'red');
		}

		// Add Items button (draft only, not auto-created from delivery)
		if (frm.doc.docstatus === 0 && !frm.doc.deal_delivery) {
			frm.add_custom_button(__('Add Items'), function() {
				show_add_items_dialog(frm);
			}).addClass('btn-primary');
		}

		// Show linked delivery info
		if (frm.doc.deal_delivery) {
			frm.set_intro(
				__('Auto-created from Deal Delivery: <a href="/app/deal-delivery/{0}">{0}</a>',
					[frm.doc.deal_delivery])
			);
		}

		// Show linked ERPNext Stock Entry
		if (frm.doc.erp_stock_entry) {
			frm.dashboard.add_comment(
				__('ERPNext Stock Entry: <a href="/app/stock-entry/{0}">{0}</a>',
					[frm.doc.erp_stock_entry]),
				'green',
				true
			);
		}

		// Set item/pack_size filters
		frm.set_query('item', 'items', function() {
			return { filters: { 'disabled': 0 } };
		});
		frm.set_query('pack_size', 'items', function() {
			return { filters: { 'is_active': 1 } };
		});

		// Filter warehouse: non-group only
		frm.set_query('warehouse', function() {
			return {
				filters: {
					'is_group': 0
				}
			};
		});
	},

	entry_type: function(frm) {
		// Show/hide supplier based on entry type
		frm.toggle_reqd('supplier', frm.doc.entry_type === 'Receipt');

		// Set default warehouse if not already set
		if (frm.doc.__islocal && !frm.doc.warehouse) {
			frappe.db.get_value('Company', 'Trustbit Mandi', 'abbr', function(r) {
				if (r && r.abbr) {
					frm.set_value('warehouse', 'Stores - ' + r.abbr);
				}
			});
		}
	}
});


frappe.ui.form.on('Mandi Stock Entry Item', {
	qty: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, 'kg', flt(row.qty) * flt(row.pack_weight_kg));
		recalculate_totals(frm);
	},

	pack_size: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.pack_size) {
			frappe.db.get_value('Deal Pack Size', row.pack_size, 'weight_kg', function(r) {
				if (r) {
					frappe.model.set_value(cdt, cdn, 'pack_weight_kg', flt(r.weight_kg));
					frappe.model.set_value(cdt, cdn, 'kg', flt(row.qty) * flt(r.weight_kg));
					recalculate_totals(frm);
				}
			});
		}
	},

	items_remove: function(frm) {
		recalculate_totals(frm);
	}
});


function recalculate_totals(frm) {
	let total_qty = 0;
	let total_kg = 0;
	(frm.doc.items || []).forEach(function(row) {
		total_qty += flt(row.qty);
		total_kg += flt(row.kg);
	});
	frm.set_value('total_qty', total_qty);
	frm.set_value('total_kg', total_kg);
	frm.set_value('total_items', (frm.doc.items || []).length);
}


function show_add_items_dialog(frm) {
	// Fetch all active items from Package Bag Master for quick selection
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Package Bag Master',
			filters: { is_active: 1 },
			fields: ['item', 'item_name', 'pack_size', 'bag_cost'],
			order_by: 'item asc, pack_size asc',
			limit_page_length: 0
		},
		callback: function(r) {
			if (!r.message || r.message.length === 0) {
				frappe.msgprint(__('No active items found in Package Bag Master.'));
				return;
			}

			let items = r.message;

			// Build rows for the dialog
			let fields = [
				{
					fieldtype: 'HTML',
					fieldname: 'items_html'
				}
			];

			let d = new frappe.ui.Dialog({
				title: __('Add Items'),
				fields: fields,
				size: 'extra-large',
				primary_action_label: __('Add'),
				primary_action: function() {
					add_selected_items(frm, d, items);
				}
			});

			// Build the HTML table
			let existing_keys = {};
			(frm.doc.items || []).forEach(function(row) {
				existing_keys[row.item + ':' + row.pack_size] = row.qty;
			});

			let html = `
				<div style="margin-bottom: 10px;">
					<input type="text" class="form-control input-sm" placeholder="${__('Search items...')}"
						id="item_search" style="max-width: 300px;">
				</div>
				<div style="max-height: 400px; overflow-y: auto;">
				<table class="table table-bordered table-sm" style="font-size: 13px;">
					<thead style="position: sticky; top: 0; background: var(--bg-color); z-index: 1;">
						<tr>
							<th style="width: 30px;"><input type="checkbox" id="select_all"></th>
							<th>${__('Item')}</th>
							<th>${__('Pack Size')}</th>
							<th style="width: 100px;">${__('Qty (Packs)')}</th>
						</tr>
					</thead>
					<tbody>`;

			items.forEach(function(item, idx) {
				let key = item.item + ':' + item.pack_size;
				let existing_qty = existing_keys[key] || 0;
				let checked = existing_qty > 0 ? 'checked' : '';

				html += `
					<tr class="item-row" data-idx="${idx}" data-item="${item.item}" data-pack="${item.pack_size}">
						<td><input type="checkbox" class="item-check" data-idx="${idx}" ${checked}></td>
						<td>${item.item_name || item.item}</td>
						<td>${item.pack_size}</td>
						<td><input type="number" class="form-control input-sm item-qty" data-idx="${idx}"
							value="${existing_qty || ''}" min="1" step="1" style="width: 90px;"></td>
					</tr>`;
			});

			html += '</tbody></table></div>';

			d.fields_dict.items_html.$wrapper.html(html);

			// Search filter
			d.$wrapper.find('#item_search').on('keyup', function() {
				let search = $(this).val().toLowerCase();
				d.$wrapper.find('.item-row').each(function() {
					let text = $(this).text().toLowerCase();
					$(this).toggle(text.indexOf(search) !== -1);
				});
			});

			// Select all toggle
			d.$wrapper.find('#select_all').on('change', function() {
				let checked = $(this).prop('checked');
				d.$wrapper.find('.item-row:visible .item-check').prop('checked', checked);
			});

			// Auto-check when qty entered
			d.$wrapper.find('.item-qty').on('input', function() {
				let val = parseFloat($(this).val()) || 0;
				let idx = $(this).data('idx');
				d.$wrapper.find(`.item-check[data-idx="${idx}"]`).prop('checked', val > 0);
			});

			d.show();
		}
	});
}


function add_selected_items(frm, dialog, items) {
	let selected = [];

	dialog.$wrapper.find('.item-check:checked').each(function() {
		let idx = $(this).data('idx');
		let qty = parseFloat(dialog.$wrapper.find(`.item-qty[data-idx="${idx}"]`).val()) || 0;
		if (qty > 0) {
			selected.push({
				item: items[idx].item,
				pack_size: items[idx].pack_size,
				qty: qty
			});
		}
	});

	if (selected.length === 0) {
		frappe.msgprint(__('Please select at least one item with quantity.'));
		return;
	}

	// Clear existing rows and add fresh
	frm.clear_table('items');

	selected.forEach(function(sel) {
		let row = frm.add_child('items');
		row.item = sel.item;
		row.pack_size = sel.pack_size;
		row.qty = sel.qty;
	});

	frm.refresh_field('items');

	// Fetch pack weights for all rows
	let promises = [];
	(frm.doc.items || []).forEach(function(row) {
		if (row.pack_size) {
			promises.push(
				frappe.db.get_value('Deal Pack Size', row.pack_size, 'weight_kg').then(function(r) {
					if (r && r.message) {
						frappe.model.set_value(row.doctype, row.name, 'pack_weight_kg', flt(r.message.weight_kg));
						frappe.model.set_value(row.doctype, row.name, 'kg', flt(row.qty) * flt(r.message.weight_kg));
					}
				})
			);
		}
	});

	Promise.all(promises).then(function() {
		recalculate_totals(frm);
		frm.dirty();
	});

	dialog.hide();
}
