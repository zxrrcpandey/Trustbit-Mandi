// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('PPS Entry', {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Print PPS Form'), function() {
                frm.print_doc();
            }, __('Actions'));
        }
    },

    amount: function(frm) {
        if (frm.doc.amount) {
            var amount_in_words = convert_to_words(frm.doc.amount);
            frm.set_value('amount_in_words', amount_in_words);
        } else {
            frm.set_value('amount_in_words', '');
        }
    },

    bank: function(frm) {
        if (frm.doc.bank) {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Mandi Bank Master',
                    name: frm.doc.bank
                },
                callback: function(r) {
                    if (r.message) {
                        frm.set_value('bank_name', r.message.bank_name || '');
                        frm.set_value('bank_branch', r.message.branch || '');
                        frm.set_value('ifsc_code', r.message.ifsc_code || '');
                        frm.set_value('account_number', r.message.account_number || frm.doc.account_number);

                        frappe.show_alert({
                            message: __('Bank details loaded'),
                            indicator: 'green'
                        }, 2);
                    }
                }
            });
        }
    },

    posting_date: function(frm) {
        if (frm.doc.posting_date && !frm.doc.cheque_date) {
            frm.set_value('cheque_date', frm.doc.posting_date);
        }
    }
});

// Convert amount to words (Indian format: Crore, Lakh, Thousand)
function convert_to_words(amount) {
    var ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
                'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
                'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    var tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

    if (amount === 0) return 'ZERO ONLY';

    amount = Math.floor(amount);

    function convertLessThanHundred(num) {
        if (num < 20) return ones[num];
        return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    }

    function convertLessThanThousand(num) {
        if (num < 100) return convertLessThanHundred(num);
        return ones[Math.floor(num / 100)] + ' HUNDRED' + (num % 100 ? ' ' + convertLessThanHundred(num % 100) : '');
    }

    var result = '';

    // Crore (1,00,00,000)
    if (amount >= 10000000) {
        result += convertLessThanThousand(Math.floor(amount / 10000000)) + ' CRORE ';
        amount %= 10000000;
    }

    // Lakh (1,00,000)
    if (amount >= 100000) {
        result += convertLessThanHundred(Math.floor(amount / 100000)) + ' LAKH ';
        amount %= 100000;
    }

    // Thousand (1,000)
    if (amount >= 1000) {
        result += convertLessThanHundred(Math.floor(amount / 1000)) + ' THOUSAND ';
        amount %= 1000;
    }

    // Hundred
    if (amount >= 100) {
        result += ones[Math.floor(amount / 100)] + ' HUNDRED ';
        amount %= 100;
    }

    // Remaining
    if (amount > 0) {
        result += convertLessThanHundred(amount) + ' ';
    }

    return result.trim() + ' ONLY';
}
