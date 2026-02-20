frappe.ui.form.on('Deal Price List Area', {
	refresh: function(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('Update Prices'), function() {
				show_update_prices_dialog(frm);
			}).addClass('btn-primary');
		}
	}
});


function show_update_prices_dialog(frm) {
	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_price_list.deal_price_list.get_items_with_prices',
		args: { price_list_area: frm.doc.name },
		callback: function(r) {
			if (!r.message || r.message.length === 0) {
				frappe.msgprint(__('No items found.'));
				return;
			}
			build_price_dialog(frm, r.message);
		}
	});
}


function build_price_dialog(frm, items) {
	let d = new frappe.ui.Dialog({
		title: __('Update Prices — {0}', [frm.doc.name]),
		fields: [
			{ fieldtype: 'HTML', fieldname: 'prices_html' }
		],
		size: 'extra-large',
		primary_action_label: __('Update'),
		primary_action: function() {
			submit_price_updates(frm, d, items);
		}
	});

	let html = `
		<div style="margin-bottom: 10px;">
			<input type="text" class="form-control input-sm" placeholder="${__('Search items...')}"
				id="price_search" style="max-width: 300px; display: inline-block;">
		</div>
		<div style="max-height: 400px; overflow-y: auto;">
		<table class="table table-bordered table-sm" style="font-size: 13px;">
			<thead style="position: sticky; top: 0; background: var(--bg-color); z-index: 1;">
				<tr>
					<th>${__('Item')}</th>
					<th style="width: 140px; text-align: right;">${__('Last Price')}</th>
					<th style="width: 140px; text-align: right;">${__('Current Price')}</th>
					<th style="width: 150px;">${__('New Price (₹/50KG)')}</th>
				</tr>
			</thead>
			<tbody>`;

	items.forEach(function(item, idx) {
		let last = item.last_price ? format_currency(item.last_price) : '-';
		let current = item.current_price ? format_currency(item.current_price) : '-';
		let current_val = item.current_price || '';

		// Show price change indicator
		let change_style = '';
		if (item.current_price && item.last_price) {
			if (item.current_price > item.last_price) {
				change_style = 'color: green;';
			} else if (item.current_price < item.last_price) {
				change_style = 'color: red;';
			}
		}

		html += `
			<tr class="price-row" data-idx="${idx}">
				<td>${item.item_name || item.item}</td>
				<td style="text-align: right; color: var(--text-muted);">${last}</td>
				<td style="text-align: right; ${change_style}">${current}</td>
				<td>
					<input type="number" class="form-control input-sm new-price" data-idx="${idx}"
						value="${current_val}" min="0" step="1"
						style="width: 130px; text-align: right;">
				</td>
			</tr>`;
	});

	html += '</tbody></table></div>';

	d.fields_dict.prices_html.$wrapper.html(html);

	// Search filter
	d.$wrapper.find('#price_search').on('keyup', function() {
		let search = $(this).val().toLowerCase();
		d.$wrapper.find('.price-row').each(function() {
			let text = $(this).text().toLowerCase();
			$(this).toggle(text.indexOf(search) !== -1);
		});
	});

	d.show();
}


function submit_price_updates(frm, dialog, items) {
	let updates = [];

	dialog.$wrapper.find('.new-price').each(function() {
		let idx = $(this).data('idx');
		let new_price = parseFloat($(this).val()) || 0;
		let current_price = parseFloat(items[idx].current_price) || 0;

		if (new_price > 0 && new_price !== current_price) {
			updates.push({
				item: items[idx].item,
				base_price_50kg: new_price
			});
		}
	});

	if (updates.length === 0) {
		frappe.msgprint(__('No price changes detected.'));
		return;
	}

	frappe.call({
		method: 'trustbit_mandi.trustbit_mandi.doctype.deal_price_list.deal_price_list.bulk_update_prices',
		args: {
			price_list_area: frm.doc.name,
			updates: updates
		},
		callback: function(r) {
			if (r.message) {
				frappe.show_alert({
					message: __('Updated prices for {0} item(s)', [r.message]),
					indicator: 'green'
				}, 5);
				dialog.hide();
			}
		}
	});
}


function format_currency(value) {
	if (!value) return '-';
	return '₹ ' + parseFloat(value).toLocaleString('en-IN');
}
