// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Tax Payment Record', {
    bank_account: function(frm) {
        if (frm.doc.bank_account) {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Mandi Bank Master',
                    name: frm.doc.bank_account
                },
                callback: function(r) {
                    if (r.message) {
                        frm.set_value('bank_name', r.message.bank_name);
                        frm.set_value('branch', r.message.branch);
                        frm.set_value('account_no', r.message.account_number);
                        frm.set_value('ifsc_code', r.message.ifsc_code);

                        frappe.show_alert({
                            message: __('Bank details loaded'),
                            indicator: 'green'
                        }, 2);
                    }
                }
            });
        } else {
            frm.set_value('bank_name', '');
            frm.set_value('branch', '');
            frm.set_value('account_no', '');
            frm.set_value('ifsc_code', '');
        }
    }
});
