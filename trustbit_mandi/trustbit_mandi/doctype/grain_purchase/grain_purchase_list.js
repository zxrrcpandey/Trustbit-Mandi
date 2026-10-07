// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

// The list shows each purchase's payment status, so Pending ones stand out without opening them.
frappe.listview_settings['Grain Purchase'] = {
    add_fields: ['payment_status'],
    get_indicator: function(doc) {
        let status = doc.payment_status || 'Pending';
        let colour = { 'Pending': 'orange', 'Paid': 'green', 'Cancelled': 'gray' }[status] || 'gray';
        return [__(status), colour, 'payment_status,=,' + status];
    }
};
