// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

const GP_DATE_FIELD = 'contract_date';

// From Date and To Date boxes that drive one ordinary filter on Contract Date, so the Filter
// button, totals and export all follow them. Frappe reads every box in page.fields_dict as a
// filter on a field of that name, so these two are taken out of it.
function gp_add_date_range(list) {
    if (list.gp_date_range || !list.filter_area) return;

    const parent = list.filter_area.standard_filters_wrapper;
    const add_box = (fieldname, label) => {
        const box = list.page.add_field({
            fieldname, label, fieldtype: 'Date',
            change: () => gp_apply_date_range(list, box),
        }, parent);
        delete list.page.fields_dict[fieldname];
        return box;
    };

    list.gp_date_range = {
        from: add_box('gp_from_date', __('From Date')),
        to: add_box('gp_to_date', __('To Date')),
        applied: '',
        syncing: false,
    };
}

function gp_apply_date_range(list, changed_box) {
    const range = list.gp_date_range;
    if (!range || range.syncing) return;

    const from = range.from.get_value();
    const to = range.to.get_value();
    if (`${from || ''}|${to || ''}` === range.applied) return;

    if (from && to && from > to) {
        frappe.show_alert({ message: __('From Date cannot be after To Date'), indicator: 'orange' });
        gp_sync_date_range(list);
        return;
    }
    range.applied = `${from || ''}|${to || ''}`;

    const filter_list = list.filter_area.filter_list;
    let existing;
    while ((existing = filter_list.get_filter(GP_DATE_FIELD))) existing.remove();
    filter_list.update_filters();

    list.start = 0;
    if (!from && !to) {
        list.refresh();
        list.on_filter_change();
        return;
    }
    const filter = from && to
        ? [list.doctype, GP_DATE_FIELD, 'Between', [from, to]]
        : [list.doctype, GP_DATE_FIELD, from ? '>=' : '<=', from || to];
    list.filter_area.add([filter]).then(() => list.on_filter_change());
}

// Keeps the boxes equal to the filter when it is changed, cleared or restored some other way.
function gp_sync_date_range(list) {
    const range = list.gp_date_range;
    if (!range) return;

    let from = '';
    let to = '';
    list.filter_area.filter_list.get_filters()
        .filter((f) => f[1] === GP_DATE_FIELD)
        .forEach((f) => {
            const condition = String(f[2]).toLowerCase();
            if (condition === 'between' && Array.isArray(f[3])) [from, to] = f[3];
            else if (condition === '>=') from = f[3];
            else if (condition === '<=') to = f[3];
        });

    range.syncing = true;
    range.from.set_input(from);
    range.to.set_input(to);
    range.applied = `${from}|${to}`;
    range.syncing = false;
}

// The list shows each purchase's payment status, so Pending ones stand out without opening them.
frappe.listview_settings['Grain Purchase'] = {
    add_fields: ['payment_status'],
    onload: function(list) {
        gp_add_date_range(list);
    },
    refresh: function(list) {
        gp_add_date_range(list);
        gp_sync_date_range(list);
    },
    get_indicator: function(doc) {
        let status = doc.payment_status || 'Pending';
        let colour = { 'Pending': 'orange', 'Paid': 'green', 'Cancelled': 'gray' }[status] || 'gray';
        return [__(status), colour, 'payment_status,=,' + status];
    }
};
