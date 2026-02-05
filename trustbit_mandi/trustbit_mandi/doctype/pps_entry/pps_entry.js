// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt
// Note: Amount to words, bank details, and cheque date are handled in Python (before_save)

frappe.ui.form.on('PPS Entry', {
    refresh: function(frm) {
        // Print PPS Form button
        if (!frm.is_new()) {
            frm.add_custom_button(__('Print PPS Form'), function() {
                frm.print_doc();
            }, __('Actions'));
        }
    }
});
