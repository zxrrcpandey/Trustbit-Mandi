// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Hamali Rate Master', {
    before_save: function(frm) {
        add_to_history(frm);
    },

    refresh: function(frm) {
        sort_history(frm);
    }
});

function add_to_history(frm) {
    let exists = false;

    if (frm.doc.rate_history && frm.doc.rate_history.length > 0) {
        for (let row of frm.doc.rate_history) {
            if (row.effective_date === frm.doc.effective_date &&
                parseFloat(row.upto_60_kg) === parseFloat(frm.doc.upto_60_kg) &&
                parseFloat(row.more_than_60_kg) === parseFloat(frm.doc.more_than_60_kg)) {
                exists = true;
                break;
            }
        }
    }

    if (!exists) {
        let child = frm.add_child('rate_history');
        child.effective_date = frm.doc.effective_date;
        child.upto_60_kg = frm.doc.upto_60_kg;
        child.more_than_60_kg = frm.doc.more_than_60_kg;

        frm.refresh_field('rate_history');

        let formatted_date = frappe.datetime.str_to_user(frm.doc.effective_date);

        frappe.show_alert({
            message: __('Rate added to history: {0}', [formatted_date]),
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
