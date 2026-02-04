// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt

frappe.ui.form.on('Grain Purchase', {
    onload: function(frm) {
        if (frm.is_new() && !frm.doc.transaction_no) {
            generate_transaction_no(frm);
        }
        if (frm.is_new()) {
            if (!frm.doc.mandi_tax_rate) {
                frm.set_value('mandi_tax_rate', 1);
            }
            if (!frm.doc.nirashrit_tax_rate) {
                frm.set_value('nirashrit_tax_rate', 0.2);
            }
        }
    },

    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Refresh Hamali Rate'), function() {
                fetch_hamali_rate(frm, true);
            }, __('Actions'));

            // Save & Print button
            frm.add_custom_button(__('Save & Print'), function() {
                frm.save().then(() => {
                    frm.print_doc();
                });
            }).addClass('btn-primary');
        }

        frm.add_custom_button(__('View Tax Balance'), function() {
            show_tax_balance_dialog();
        }, __('Actions'));

        if (frm.is_new() && frm.doc.contract_date) {
            setTimeout(function() {
                fetch_hamali_rate(frm, false);
            }, 300);
        }

        setTimeout(function() {
            calculate_values(frm);
        }, 500);

        fetch_tax_balance(frm);
    },

    contract_date: function(frm) {
        if (frm.doc.contract_date) {
            fetch_hamali_rate(frm, false);
        }
    },

    kg_of_bag: function(frm) {
        if (frm.doc.contract_date) {
            fetch_hamali_rate(frm, false);
        }
        calculate_values(frm);
    },

    actual_bag: function(frm) {
        calculate_values(frm);
    },

    nos_kg: function(frm) {
        calculate_values(frm);
    },

    auction_rate: function(frm) {
        calculate_values(frm);
    },

    hamali_rate: function(frm) {
        calculate_values(frm);
    },

    hamali_rate_include: function(frm) {
        calculate_values(frm);
    },

    mandi_tax_rate: function(frm) {
        calculate_taxes(frm);
    },

    nirashrit_tax_rate: function(frm) {
        calculate_taxes(frm);
    },

    amount: function(frm) {
        calculate_taxes(frm);
    },

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
                        frm.set_value('account_number', r.message.account_number);
                        frm.set_value('bank_name', r.message.bank_name);
                        frm.set_value('branch', r.message.branch);
                        frm.set_value('ifsc_code', r.message.ifsc_code);
                        frappe.show_alert({
                            message: __('Bank details loaded'),
                            indicator: 'green'
                        }, 2);
                    }
                }
            });
        } else {
            frm.set_value('account_number', '');
            frm.set_value('bank_name', '');
            frm.set_value('branch', '');
            frm.set_value('ifsc_code', '');
        }
    }
});

function fetch_tax_balance(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Tax Payment Record',
            filters: {'docstatus': ['<', 2]},
            fields: ['tax_type', 'amount'],
            limit_page_length: 0
        },
        callback: function(r) {
            let mandi_paid = 0, nirashrit_paid = 0;

            if (r.message) {
                r.message.forEach(function(row) {
                    let tax_type = (row.tax_type || '').toLowerCase();
                    if (tax_type.includes('nirashrit')) {
                        nirashrit_paid += flt(row.amount, 0);
                    } else if (tax_type.includes('mandi')) {
                        mandi_paid += flt(row.amount, 0);
                    }
                });
            }

            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Grain Purchase',
                    filters: {'docstatus': ['<', 2]},
                    fields: ['mandi_tax', 'nirashrit_tax'],
                    limit_page_length: 0
                },
                callback: function(r2) {
                    let mandi_liability = 0, nirashrit_liability = 0;

                    if (r2.message) {
                        r2.message.forEach(function(row) {
                            mandi_liability += flt(row.mandi_tax, 0);
                            nirashrit_liability += flt(row.nirashrit_tax, 0);
                        });
                    }

                    let mandi_balance = mandi_paid - mandi_liability;
                    let nirashrit_balance = nirashrit_paid - nirashrit_liability;

                    frm.set_value('mandi_tax_paid', mandi_paid);
                    frm.set_value('mandi_tax_balance', mandi_balance);
                    frm.set_value('nirashrit_tax_paid', nirashrit_paid);
                    frm.set_value('nirashrit_tax_balance', nirashrit_balance);

                    update_tax_balance_dashboard(frm, {
                        mandi_paid: mandi_paid,
                        mandi_liability: mandi_liability,
                        mandi_balance: mandi_balance,
                        nirashrit_paid: nirashrit_paid,
                        nirashrit_liability: nirashrit_liability,
                        nirashrit_balance: nirashrit_balance
                    });
                }
            });
        }
    });
}

function update_tax_balance_dashboard(frm, data) {
    let total_paid = data.mandi_paid + data.nirashrit_paid;
    let total_liability = data.mandi_liability + data.nirashrit_liability;
    let total_balance = total_paid - total_liability;

    let mandi_color = data.mandi_balance >= 0 ? 'green' : 'red';
    let nirashrit_color = data.nirashrit_balance >= 0 ? 'green' : 'red';
    let total_color = total_balance >= 0 ? 'green' : 'red';

    let html = `
        <div class="tax-balance-dashboard" style="padding: 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 15px;">
            <h5 style="margin-bottom: 15px; color: #333;">
                <i class="fa fa-balance-scale"></i> Current Tax Balance
            </h5>
            <div class="row">
                <div class="col-sm-4">
                    <div style="text-align: center; padding: 10px; background: white; border-radius: 5px; border-left: 4px solid ${mandi_color};">
                        <div style="font-size: 12px; color: #888;">Mandi Tax (1%)</div>
                        <div style="font-size: 11px; color: #666;">
                            Paid: ${format_number(data.mandi_paid)} | Due: ${format_number(data.mandi_liability)}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: ${mandi_color};">
                            ${format_number(data.mandi_balance)}
                        </div>
                        <div style="font-size: 10px; color: ${mandi_color};">
                            ${data.mandi_balance >= 0 ? 'Advance Available' : 'Payment Required'}
                        </div>
                    </div>
                </div>
                <div class="col-sm-4">
                    <div style="text-align: center; padding: 10px; background: white; border-radius: 5px; border-left: 4px solid ${nirashrit_color};">
                        <div style="font-size: 12px; color: #888;">Nirashrit Tax (0.2%)</div>
                        <div style="font-size: 11px; color: #666;">
                            Paid: ${format_number(data.nirashrit_paid)} | Due: ${format_number(data.nirashrit_liability)}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: ${nirashrit_color};">
                            ${format_number(data.nirashrit_balance)}
                        </div>
                        <div style="font-size: 10px; color: ${nirashrit_color};">
                            ${data.nirashrit_balance >= 0 ? 'Advance Available' : 'Payment Required'}
                        </div>
                    </div>
                </div>
                <div class="col-sm-4">
                    <div style="text-align: center; padding: 10px; background: white; border-radius: 5px; border-left: 4px solid ${total_color};">
                        <div style="font-size: 12px; color: #888;">Total Tax</div>
                        <div style="font-size: 11px; color: #666;">
                            Paid: ${format_number(total_paid)} | Due: ${format_number(total_liability)}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: ${total_color};">
                            ${format_number(total_balance)}
                        </div>
                        <div style="font-size: 10px; color: ${total_color};">
                            ${total_balance >= 0 ? 'Overall Advance' : 'Payment Required'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (frm.fields_dict.tax_balance_html) {
        frm.fields_dict.tax_balance_html.$wrapper.html(html);
    }
}

function show_tax_balance_dialog() {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Tax Payment Record',
            filters: {'docstatus': ['<', 2]},
            fields: ['tax_type', 'amount'],
            limit_page_length: 0
        },
        callback: function(r) {
            let mandi_paid = 0, nirashrit_paid = 0;

            if (r.message) {
                r.message.forEach(function(row) {
                    let tax_type = (row.tax_type || '').toLowerCase();
                    if (tax_type.includes('nirashrit')) {
                        nirashrit_paid += flt(row.amount, 0);
                    } else if (tax_type.includes('mandi')) {
                        mandi_paid += flt(row.amount, 0);
                    }
                });
            }

            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Grain Purchase',
                    filters: {'docstatus': ['<', 2]},
                    fields: ['mandi_tax', 'nirashrit_tax', 'amount'],
                    limit_page_length: 0
                },
                callback: function(r2) {
                    let mandi_liability = 0, nirashrit_liability = 0, total_purchase = 0;

                    if (r2.message) {
                        r2.message.forEach(function(row) {
                            mandi_liability += flt(row.mandi_tax, 0);
                            nirashrit_liability += flt(row.nirashrit_tax, 0);
                            total_purchase += flt(row.amount, 0);
                        });
                    }

                    let mandi_balance = mandi_paid - mandi_liability;
                    let nirashrit_balance = nirashrit_paid - nirashrit_liability;
                    let total_balance = mandi_balance + nirashrit_balance;

                    let dialog = new frappe.ui.Dialog({
                        title: __('Tax Balance Summary'),
                        size: 'large',
                        fields: [{ fieldtype: 'HTML', fieldname: 'balance_html' }]
                    });

                    let html = `
                        <style>
                            .tax-summary-table { width: 100%; border-collapse: collapse; }
                            .tax-summary-table th, .tax-summary-table td { padding: 12px; text-align: right; border-bottom: 1px solid #eee; }
                            .tax-summary-table th { background: #f5f5f5; font-weight: 600; text-align: left; }
                            .tax-summary-table td:first-child { text-align: left; }
                            .positive { color: green; font-weight: bold; }
                            .negative { color: red; font-weight: bold; }
                            .total-row { background: #f9f9f9; font-weight: bold; }
                        </style>

                        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                            <h5>Total Grain Purchases: ${format_number(total_purchase)}</h5>
                            <small>Tax: 1% (Mandi) + 0.2% (Nirashrit) = 1.2% of purchase value</small>
                        </div>

                        <table class="tax-summary-table">
                            <thead>
                                <tr>
                                    <th>Tax Type</th>
                                    <th>Rate</th>
                                    <th>Total Paid</th>
                                    <th>Liability</th>
                                    <th>Balance</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>Mandi Tax</strong></td>
                                    <td>1%</td>
                                    <td>${format_number(mandi_paid)}</td>
                                    <td>${format_number(mandi_liability)}</td>
                                    <td class="${mandi_balance >= 0 ? 'positive' : 'negative'}">${format_number(mandi_balance)}</td>
                                    <td><span class="indicator-pill ${mandi_balance >= 0 ? 'green' : 'red'}">${mandi_balance >= 0 ? 'Advance' : 'Due'}</span></td>
                                </tr>
                                <tr>
                                    <td><strong>Nirashrit Tax</strong></td>
                                    <td>0.2%</td>
                                    <td>${format_number(nirashrit_paid)}</td>
                                    <td>${format_number(nirashrit_liability)}</td>
                                    <td class="${nirashrit_balance >= 0 ? 'positive' : 'negative'}">${format_number(nirashrit_balance)}</td>
                                    <td><span class="indicator-pill ${nirashrit_balance >= 0 ? 'green' : 'red'}">${nirashrit_balance >= 0 ? 'Advance' : 'Due'}</span></td>
                                </tr>
                                <tr class="total-row">
                                    <td><strong>TOTAL</strong></td>
                                    <td>1.2%</td>
                                    <td>${format_number(mandi_paid + nirashrit_paid)}</td>
                                    <td>${format_number(mandi_liability + nirashrit_liability)}</td>
                                    <td class="${total_balance >= 0 ? 'positive' : 'negative'}">${format_number(total_balance)}</td>
                                    <td><span class="indicator-pill ${total_balance >= 0 ? 'green' : 'red'}">${total_balance >= 0 ? 'Advance' : 'Due'}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    `;

                    dialog.fields_dict.balance_html.$wrapper.html(html);
                    dialog.show();
                }
            });
        }
    });
}

function fetch_hamali_rate(frm, force_refresh) {
    if (!frm.doc.contract_date) return;
    if (!frm.is_new() && !force_refresh) return;

    let kg_per_bag = flt(frm.doc.kg_of_bag, 60);

    frappe.call({
        method: 'frappe.client.get',
        args: { doctype: 'Hamali Rate Master', name: 'Mandi' },
        callback: function(r) {
            if (r.message && r.message.is_active) {
                let master = r.message;
                let applicable_rate = null;
                let contract_date_obj = frappe.datetime.str_to_obj(frm.doc.contract_date + ' 23:59:59');
                let contract_timestamp = contract_date_obj.getTime();

                if (master.rate_history && master.rate_history.length > 0) {
                    let best_match = null, best_match_timestamp = 0;
                    for (let i = 0; i < master.rate_history.length; i++) {
                        let history = master.rate_history[i];
                        let history_timestamp = frappe.datetime.str_to_obj(history.effective_date).getTime();
                        if (history_timestamp <= contract_timestamp && history_timestamp > best_match_timestamp) {
                            best_match = history;
                            best_match_timestamp = history_timestamp;
                        }
                    }
                    applicable_rate = best_match;
                }

                if (!applicable_rate) {
                    applicable_rate = { effective_date: master.effective_date, upto_60_kg: master.upto_60_kg, more_than_60_kg: master.more_than_60_kg };
                }

                let hamali_rate = kg_per_bag <= 60 ? flt(applicable_rate.upto_60_kg, 0) : flt(applicable_rate.more_than_60_kg, 0);
                frm.set_value('hamali_rate', hamali_rate);

                frappe.show_alert({
                    message: __('Hamali Rate: {0}', [hamali_rate.toFixed(2)]),
                    indicator: 'green'
                }, 3);

                setTimeout(function() { calculate_values(frm); }, 200);
            } else {
                if (!frm.doc.hamali_rate) frm.set_value('hamali_rate', 7.50);
            }
        },
        error: function() {
            if (!frm.doc.hamali_rate) frm.set_value('hamali_rate', 7.50);
            setTimeout(function() { calculate_values(frm); }, 200);
        }
    });
}

function calculate_values(frm) {
    if (!frm.doc) return;

    let kg_per_bag = flt(frm.doc.kg_of_bag, 60);
    let actual_bags = flt(frm.doc.actual_bag, 0);
    let nos_kg = flt(frm.doc.nos_kg, 0);
    let auction_rate = flt(frm.doc.auction_rate, 0);
    let hamali_rate = flt(frm.doc.hamali_rate, 0);
    let hamali_include = frm.doc.hamali_rate_include ? 1 : 0;

    let actual_weight = (actual_bags * (kg_per_bag / 100)) + (nos_kg / 100);
    let amount = auction_rate * actual_weight;
    let total_bags_for_hamali = actual_bags + (nos_kg / 100);
    let hamali = 0, net_amount = 0;

    if (hamali_include === 1) {
        hamali = 0;
        net_amount = Math.round(amount);
    } else {
        hamali = Math.round(total_bags_for_hamali * hamali_rate);
        net_amount = Math.round(amount - hamali);
    }

    frappe.model.set_value(frm.doctype, frm.docname, 'actual_weight', flt(actual_weight, 2));
    frappe.model.set_value(frm.doctype, frm.docname, 'amount', flt(amount, 2));
    frappe.model.set_value(frm.doctype, frm.docname, 'hamali', hamali);
    frappe.model.set_value(frm.doctype, frm.docname, 'net_amount', net_amount);

    setTimeout(function() { calculate_taxes(frm); }, 100);
}

function calculate_taxes(frm) {
    if (!frm.doc) return;

    let amount = flt(frm.doc.amount, 0);
    let mandi_tax_rate = flt(frm.doc.mandi_tax_rate, 1);
    let nirashrit_tax_rate = flt(frm.doc.nirashrit_tax_rate, 0.2);

    let mandi_tax = Math.round((amount * mandi_tax_rate) / 100 * 100) / 100;
    let nirashrit_tax = Math.round((amount * nirashrit_tax_rate) / 100 * 100) / 100;
    let total_tax = Math.round((mandi_tax + nirashrit_tax) * 100) / 100;

    frm.set_value('mandi_tax', mandi_tax);
    frm.set_value('nirashrit_tax', nirashrit_tax);
    frm.set_value('total_tax', total_tax);
}

function generate_transaction_no(frm) {
    if (!frm.doc.transaction_no) {
        let today = new Date();
        let year = today.getFullYear();
        let month = String(today.getMonth() + 1).padStart(2, '0');
        let day = String(today.getDate()).padStart(2, '0');
        let random = Math.floor(Math.random() * 90000) + 10000;
        frm.set_value('transaction_no', 'TXN-' + year + '-' + month + '-' + day + '-' + random);
    }
}

function flt(value, default_value) {
    if (value === null || value === undefined || value === '') return default_value || 0;
    let num = parseFloat(value);
    return isNaN(num) ? (default_value || 0) : num;
}

function format_number(num) {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
