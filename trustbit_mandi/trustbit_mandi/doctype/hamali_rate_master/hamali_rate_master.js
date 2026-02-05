// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Hamali Rate Master', {
    refresh: function(frm) {
        // Sort history table by date (newest first) for display
        if (frm.doc.rate_history && frm.doc.rate_history.length > 0) {
            frm.doc.rate_history.sort(function(a, b) {
                return new Date(b.effective_date) - new Date(a.effective_date);
            });
            frm.refresh_field('rate_history');
        }
    }
});
