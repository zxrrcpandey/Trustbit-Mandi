// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Hamali Rate Master', {
    refresh: function(frm) {
        sort_history(frm);
    },

    validate: function(frm) {
        // Only add to history if rates actually changed and are valid
        add_to_history(frm);
    }
});

function add_to_history(frm) {
    let upto_60 = parseFloat(frm.doc.upto_60_kg) || 0;
    let more_60 = parseFloat(frm.doc.more_than_60_kg) || 0;

    // Don't add if both rates are 0
    if (upto_60 === 0 && more_60 === 0) {
        return;
    }

    // Check if this exact rate combination already exists in history
    let exists = false;

    if (frm.doc.rate_history && frm.doc.rate_history.length > 0) {
        for (let row of frm.doc.rate_history) {
            let row_upto = parseFloat(row.upto_60_kg) || 0;
            let row_more = parseFloat(row.more_than_60_kg) || 0;

            // Check if same rates already exist
            if (row_upto === upto_60 && row_more === more_60) {
                exists = true;
                break;
            }
        }
    }

    // Only add if rates are different from all existing entries
    if (!exists) {
        let child = frm.add_child('rate_history');
        child.effective_date = frm.doc.effective_date;
        child.upto_60_kg = upto_60;
        child.more_than_60_kg = more_60;

        frm.refresh_field('rate_history');

        frappe.show_alert({
            message: __('Rate added to history'),
            indicator: 'green'
        }, 3);
    }
}

function sort_history(frm) {
    if (frm.doc.rate_history && frm.doc.rate_history.length > 0) {
        frm.doc.rate_history.sort(function(a, b) {
            let date_a = new Date(a.effective_date);
            let date_b = new Date(b.effective_date);
            return date_b - date_a;
        });
        frm.refresh_field('rate_history');
    }
}
