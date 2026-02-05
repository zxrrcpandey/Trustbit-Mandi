// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt
// Note: Bank details auto-fill is handled in Python (before_save)

frappe.ui.form.on('Tax Payment Record', {
    refresh: function(frm) {
        // Print button for saved records
        if (!frm.is_new()) {
            frm.add_custom_button(__('Print'), function() {
                frm.print_doc();
            });
        }
    }
});
