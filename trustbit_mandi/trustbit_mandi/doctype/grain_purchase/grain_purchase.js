// Copyright (c) 2026, Trustbit Software and contributors
// For license information, please see license.txt
// Note: All business logic (calculations, defaults, bank/hamali fetching) is in Python

frappe.ui.form.on('Grain Purchase', {
    refresh: function(frm) {
        // Save & Print button
        if (!frm.is_new()) {
            frm.add_custom_button(__('Save & Print'), function() {
                frm.save().then(() => {
                    frm.print_doc();
                });
            }).addClass('btn-primary');
        }

        // View Tax Balance button
        frm.add_custom_button(__('View Tax Balance'), function() {
            show_tax_balance_dialog();
        }, __('Actions'));

        // Display tax balance dashboard
        fetch_tax_balance(frm);
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
                        nirashrit_paid += flt(row.amount);
                    } else if (tax_type.includes('mandi')) {
                        mandi_paid += flt(row.amount);
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
                            mandi_liability += flt(row.mandi_tax);
                            nirashrit_liability += flt(row.nirashrit_tax);
                        });
                    }

                    let mandi_balance = mandi_paid - mandi_liability;
                    let nirashrit_balance = nirashrit_paid - nirashrit_liability;

                    // Update read-only fields for display
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
                        nirashrit_paid += flt(row.amount);
                    } else if (tax_type.includes('mandi')) {
                        mandi_paid += flt(row.amount);
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
                            mandi_liability += flt(row.mandi_tax);
                            nirashrit_liability += flt(row.nirashrit_tax);
                            total_purchase += flt(row.amount);
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

function flt(value) {
    if (value === null || value === undefined || value === '') return 0;
    let num = parseFloat(value);
    return isNaN(num) ? 0 : num;
}

function format_number(num) {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
