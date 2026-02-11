# Trustbit Mandi - Project Documentation

**App**: trustbit_mandi
**Framework**: Frappe v15 / ERPNext
**Developer**: Trustbit Software
**Date**: February 2026
**Site (Production)**: ethanol.trustbit.in
**Site (Local Dev)**: mandi.local:8004
**Site (Demo)**: demo.trustbit.cloud

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Module Structure](#2-module-structure)
3. [Doctypes](#3-doctypes)
4. [Reports](#4-reports)
5. [Print Formats](#5-print-formats)
6. [Features Implemented](#6-features-implemented)
7. [Bugs Encountered & Solutions](#7-bugs-encountered--solutions)
8. [Server & Deployment Details](#8-server--deployment-details)
9. [Pending / Future Work](#9-pending--future-work)

---

## 1. Project Overview

Trustbit Mandi is a custom Frappe application for managing grain purchase operations at an agricultural mandi (market). It handles the complete lifecycle of grain purchases from farmers, including:

- Recording grain purchases with weight calculations
- Computing taxes (Mandi Tax, Nirashrit Tax)
- Managing hamali (labor) charges
- Tracking payments to farmers (Cash, Cheque, RTGS, NEFT, Bank Transfer, UPI)
- Generating bank payment files (NEFT/RTGS Excel, DTR Excel)
- Krishi Upaj Mandi government format exports
- Tax deposit tracking with running balance
- Multiple print formats (receipts, RTGS forms, Mandi Form 11)

---

## 2. Module Structure

```
apps/trustbit_mandi/trustbit_mandi/trustbit_mandi/
├── doctype/
│   ├── grain_purchase/          # Core transaction doctype
│   ├── pps_entry/               # PPS Entry (submittable)
│   ├── tax_payment_record/      # Tax Payment Record (submittable)
│   ├── hamali_rate_master/      # Hamali rate configuration
│   ├── hamali_rate_history/     # Child table for hamali rate history
│   ├── mandi_bank_master/       # Bank account master
│   ├── mandi_bank/              # Bank master
│   └── mandi_tax_type/          # Tax type master (Mandi Tax, Nirashrit Tax)
├── report/
│   ├── mandi_all_in_one_report/ # Comprehensive report with Excel exports
│   ├── mandi_purchase_report/   # Purchase-focused report
│   ├── mandi_payment_report/    # Payment-focused report
│   └── mandi_tax_report/        # Tax ledger with running balance
├── print_format/
│   ├── grain_purchase_receipt/  # Standard receipt print
│   ├── mandi_form_11/          # Hindi प्रपत्र ग्यारह format
│   ├── mandi_purchase_report_format/  # Purchase summary format
│   ├── rtgs_neft_form/         # Full RTGS/NEFT bank form
│   ├── rtgs_format_v3/         # Compact RTGS form
│   └── pps_payment_form_cbi/   # PPS CBI payment form
└── workspace/
    └── mandi/                   # Module workspace
```

---

## 3. Doctypes

### 3.1 Grain Purchase (Core Doctype)

The primary transaction doctype. Records every grain purchase from a farmer.

**Key Fields:**
| Field | Type | Description |
|-------|------|-------------|
| contract_date | Date | Date of purchase contract |
| contract_number | Data | Contract reference number |
| as_flag | Select (A/S) | Auction/Settlement flag |
| farmer_name | Data | Name of the farmer |
| address | Data | Farmer's address |
| phone_number | Data | Farmer's phone |
| gsm | Select | Commodity (गेहूं, चावल, मक्का/भुट्टा, जौ, बाजरा, etc.) |
| transaction_no | Data | Auto-generated TXN-YYYY-MM-DD-XXXXX |
| expected_bag | Float | Expected number of bags |
| actual_bag | Float | Actual number of bags |
| kg_of_bag | Float | Weight per bag (60 or 80 KG) |
| nos_kg | Float | Loose/extra kilograms |
| actual_weight | Float (read-only) | Calculated weight in Quintals |
| auction_rate | Currency | Rate per quintal |
| amount | Currency (read-only) | auction_rate × actual_weight |
| rounded_amount | Currency (read-only) | Rounded amount |
| rounded_off | Currency (read-only) | Rounding difference |
| hamali_rate | Currency | Rate per bag (from Hamali Rate Master) |
| hamali_rate_include | Check | If checked, hamali = 0 |
| hamali | Currency (read-only) | Calculated hamali |
| net_amount | Currency (read-only) | amount - hamali |
| mandi_tax_type | Link → Mandi Tax Type | Link to tax master |
| mandi_tax_rate | Percent | Auto-fetched from master (default 1%) |
| mandi_tax | Currency (read-only) | Calculated mandi tax |
| nirashrit_tax_type | Link → Mandi Tax Type | Link to tax master |
| nirashrit_tax_rate | Percent | Auto-fetched from master (default 0.2%) |
| nirashrit_tax | Currency (read-only) | Calculated nirashrit tax |
| total_tax | Currency (read-only) | mandi_tax + nirashrit_tax |
| payment_status | Select | Pending / Partial / Paid / Cancelled |
| paid_amount | Currency | Amount actually paid |
| balance_amount | Currency (read-only) | net_amount - paid_amount |
| pay_date | Date | Payment date |
| payment_mode | Select | Cash/Bank Transfer/Cheque/UPI/NEFT/RTGS |
| bank_account | Link → Mandi Bank Master | Farmer's bank account |
| bank_name | Data | Auto-filled from bank master |
| account_number | Data | Auto-filled from bank master |
| branch | Data | Auto-filled from bank master |
| ifsc_code | Data | Auto-filled from bank master |

**Calculation Logic (Python - `grain_purchase.py`):**

```
actual_weight = (actual_bag × (kg_of_bag / 100)) + (nos_kg / 100)    [in Quintal]
amount = auction_rate × actual_weight
rounded_amount = round(amount)
rounded_off = rounded_amount - amount

If hamali_rate_include:
    hamali = 0, net_amount = round(amount)
Else:
    hamali = round((actual_bag + nos_kg/100) × hamali_rate)
    net_amount = round(amount - hamali)

mandi_tax = round(amount × mandi_tax_rate / 100, 2)
nirashrit_tax = round(amount × nirashrit_tax_rate / 100, 2)
total_tax = round(mandi_tax + nirashrit_tax, 2)
balance_amount = net_amount - paid_amount
```

**Lifecycle Hooks:**
- `before_insert`: Generate transaction number, set default tax types, fetch hamali rate
- `before_save`: Check paid modification lock, fetch tax rates from master, refetch hamali rate, fetch bank details, calculate all values

**Payment Lock:**
Once `payment_status = "Paid"`, only users with "System Manager" role can modify the entry. Others get `frappe.PermissionError`.

**Tax Balance Dashboard:**
The Grain Purchase form displays a live tax balance dashboard (HTML widget) showing:
- Mandi Tax: Paid vs Liability vs Balance
- Nirashrit Tax: Paid vs Liability vs Balance
- Total: Combined balance with color indicators (green = advance, red = due)

**Roles with Access:**
- System Manager (full)
- Stock Manager (full - create, read, write, delete, email, export, print, report, share)

### 3.2 PPS Entry (Submittable)

Submittable doctype for PPS (Procurement Price Support) entries.

**Roles:** System Manager, Stock Manager (with submit/cancel/amend permissions)

### 3.3 Tax Payment Record (Submittable)

Records tax deposits made to the government.

**Key Fields:**
- tax_type (Mandi Tax / Nirashrit Tax)
- amount
- deposit_date
- payment_mode
- tax_deposit_for (Mandi / Chaupal)

**Roles:** System Manager, Stock Manager (with submit/cancel/amend permissions)

### 3.4 Hamali Rate Master

Manages hamali (labor) rates with historical tracking.

**Key Fields:**
- effective_date
- upto_60_kg (rate for bags ≤ 60 KG)
- more_than_60_kg (rate for bags > 60 KG)
- is_active (Check)
- rate_history (Child table - Hamali Rate History)

**Rate Selection Logic:**
- Finds the most recent history entry on or before the contract_date
- Falls back to current master rate if no history match
- Default rate: 7.50 if master doesn't exist or is inactive

### 3.5 Mandi Tax Type

Master for tax types and their rates.

**Key Fields:**
- tax_type_name (Data, unique) - e.g., "Mandi Tax", "Nirashrit Tax"
- rate (Percent, required) - e.g., 1, 0.2

**Current Master Data:**
| Tax Type | Rate |
|----------|------|
| Mandi Tax | 1% |
| Nirashrit Tax | 0.2% |

### 3.6 Mandi Bank Master

Farmer bank account details for payment processing.

**Key Fields:** bank_name, account_number, branch, ifsc_code

### 3.7 Mandi Bank

Bank master (parent-level bank info).

---

## 4. Reports

All reports are Script Reports (Python + JS). Each has a "Print PDF" button for browser-based printing.

### 4.1 Mandi All In One Report

The most comprehensive report with multiple export options.

**Filters:** From Date, To Date, A/S Flag, Payment Status, Payment Mode, Commodity (GSM), Farmer Name

**Columns (27):** S.No., Contract Date, Contract No., A/S, Farmer Name, Address, Phone, Commodity, Transaction No., Exp. Bag, Actual Bag, Weight (Qtl), Rate, Amount, Rounded Amt, Hamali, Net Amount, Mandi Tax, Nirashrit Tax, Total Tax, Pay Status, Payment Date, Pay Mode, Bank, Account No., IFSC, ID

**Report Summary:** Total Weight, Total Amount, Total Hamali, Total Net Amount

**Export Buttons (JS):**
- **Print PDF** - Browser print with landscape A4 layout
- **NEFT/RTGS Excel (Bank)** - Excel file for bulk bank NEFT/RTGS payments
- **DTR Excel (Bank)** - Direct Transfer Request Excel format
- **Krishi Upaj Mandi (A)** - Government format export for Auction entries
- **Krishi Upaj Mandi (S)** - Government format export for Settlement entries
- **Bulk RTGS Forms** - Print multiple RTGS request forms at once

**Whitelisted API Methods:**
- `export_neft_rtgs_excel(**filters)` - Generates NEFT/RTGS Excel using openpyxl
- `export_dtr_excel(**filters)` - Generates DTR Excel using openpyxl
- `export_krishi_upaj_excel(**filters)` - Generates Krishi Upaj Mandi format Excel
- `get_rtgs_entries(**filters)` - Returns entries with bank details for RTGS form printing

### 4.2 Mandi Purchase Report

Simple purchase listing by date range.

**Filters:** From Date (required), To Date (required), Farmer Name

**Columns:** S.No., Farmer Name, Address, Phone, Contract Date, Contract No., Exp. Bag, Transaction No., Actual Bag, Actual Weight, Rate, Amount

### 4.3 Mandi Payment Report

Payment-focused report filtered by payment date.

**Filters:** Payment Date From, Payment Date To, Payment Status, Payment Mode, GSM (Commodity)

**Columns:** S.No., Contract Date, Contract No., Farmer Name, Address, Phone, Transaction No., Exp. Bag, Actual Bag, Rate, Actual Weight, Amount, Hamali, Net Amount, Commodity, Payment Status

**Report Summary:** Total Net Amount, Total Amount, Total Hamali, Total Weight

### 4.4 Mandi Tax Report

Tax ledger with opening balance, running balance, and closing balance.

**Filters:** Period (Monthly/Quarterly/Half-Yearly/Yearly), From Date, To Date, Tax Deposit For (Mandi/Chaupal), Tax Type (Mandi Tax/Nirashrit Tax)

**Columns:** Date, Description, Type, Reference, Mandi Tax Deducted, Nirashrit Tax Deducted, Mandi Tax Paid, Nirashrit Tax Paid, Mandi Tax Balance, Nirashrit Tax Balance, Total Balance

**Logic:**
1. Calculates opening balance from all transactions before `from_date`
2. Merges Grain Purchase deductions + Tax Payment Record payments into a timeline
3. Sorts by date (payments before deductions on same date)
4. Calculates running balance: `Balance = Opening + Payments - Deductions`
5. Shows closing balance row

**Chart:** Bar chart comparing Tax Deducted vs Tax Paid for both tax types

**Report Summary:** Total Tax Deducted, Total Tax Paid, Mandi Tax Balance, Nirashrit Tax Balance, Net Balance

---

## 5. Print Formats

All print formats are Jinja-based HTML templates for the Grain Purchase doctype.

### 5.1 Grain Purchase Receipt
- Standard receipt format
- Includes: transaction details, farmer info, product calculation, hamali, taxes, payment details (paid amount, balance, status), bank details
- Net payable amount highlighted box
- Signature section (Authorized Signatory + Farmer)

### 5.2 Mandi Form 11 (प्रपत्र ग्यारह)
- Hindi language format required by Krishi Upaj Mandi
- Landscape layout with colorful tax summary
- Official government form format

### 5.3 Mandi Purchase Report Format
- Landscape purchase summary table
- Designed for batch printing of daily purchases

### 5.4 RTGS NEFT Form
- Full-size CBI (Central Bank of India) RTGS/NEFT transfer request form
- Includes counter foil on the left side
- Bank details, amount in words, signatures

### 5.5 RTGS Format V3
- Compact version of RTGS form with counter foil
- More efficient for printing multiple entries

### 5.6 PPS Payment Form (CBI)
- Payment form for PPS entries via Central Bank of India

---

## 6. Features Implemented

### 6.1 Stock Manager Role Access
**What:** Added "Stock Manager" role with full permissions to all Trustbit Mandi doctypes.

**Details:**
- Regular doctypes: create, read, write, delete, email, export, print, report, share
- Submittable doctypes (PPS Entry, Tax Payment Record): additionally submit, cancel, amend
- Hamali Rate History (child table) excluded from role permissions

### 6.2 Payment Tracking Fields
**What:** Added `paid_amount` and `balance_amount` fields to Grain Purchase.

**Details:**
- `paid_amount` (Currency, editable) - How much has been paid to the farmer
- `balance_amount` (Currency, read-only) - Auto-calculated as `net_amount - paid_amount`
- JS logic auto-sets `payment_status` based on `paid_amount`:
  - `paid_amount <= 0` → Pending
  - `paid_amount >= net_amount` → Paid
  - Otherwise → Partial

### 6.3 Tax Rate Master Integration
**What:** Tax rates now come from the Mandi Tax Type master instead of being hardcoded.

**Details:**
- Added `rate` (Percent) field to Mandi Tax Type doctype
- Added `mandi_tax_type` and `nirashrit_tax_type` Link fields in Grain Purchase
- Auto-fetches rates using `fetch_from` and `fetch_if_empty`
- Python `fetch_tax_rates()` method reads rates on every save
- JS handlers update rates when tax type link changes
- Fallback defaults: Mandi Tax = 1%, Nirashrit Tax = 0.2%

### 6.4 Grain Purchase Receipt Print Format
**What:** Custom Jinja print format for Grain Purchase documents.

**Details:**
- Full receipt with all transaction details
- Payment section showing paid amount, balance, and status
- Bank details section
- Net payable amount in a highlighted box
- Signature section for both parties

### 6.5 Print Formats from Demo Server
**What:** Copied 4 print formats from the demo server (demo.trustbit.cloud).

**Formats:**
- Mandi Form 11 (Hindi government format)
- Mandi Purchase Report Format (landscape summary)
- RTGS NEFT Form (full bank form with counter foil)
- RTGS Format V3 (compact bank form)

### 6.6 PDF Print Button on All Reports
**What:** Added "Print PDF" button to all 4 script reports.

**Details:**
- Captures the current filtered data table from the browser DOM
- Opens a new print-friendly window with:
  - Report title
  - Applied filter summary
  - Data table with borders and formatting
  - Timestamp footer
- Triggers browser print dialog for PDF save
- Landscape A4 layout with 8mm margins

### 6.7 Excel Export Functions
**What:** Multiple Excel export formats from the All-In-One Report.

**Exports:**
1. **NEFT/RTGS Excel** - For bulk bank payments with beneficiary details
2. **DTR Excel** - Direct Transfer Request format for banks
3. **Krishi Upaj Mandi Excel** - Government portal format (separate A and S exports)

All use openpyxl with styled headers, borders, and auto-width columns.

### 6.8 Bulk RTGS Form Printing
**What:** Print multiple RTGS transfer request forms from the All-In-One Report.

**Details:**
- Fetches all entries with bank details (account_number + ifsc_code)
- Generates individual RTGS form HTML for each entry
- Each form on a separate page (page-break-after)
- Includes: S.No., Date, Contract No., Farmer, Address, Phone, Commodity, Weight, Amount, Bank details, Payment Mode
- Signature boxes for Authorized Signatory and Receiver

### 6.9 Tax Balance Dashboard
**What:** Live tax balance widget on the Grain Purchase form.

**Details:**
- Shows real-time Mandi Tax, Nirashrit Tax, and Total balance
- Color-coded: Green = Advance Available, Red = Payment Required
- Separate "View Tax Balance" dialog with detailed table
- Data sourced from Tax Payment Record (payments) and Grain Purchase (liabilities)

### 6.10 Rounded Off Amount
**What:** Added `rounded_off` and `rounded_amount` fields to Grain Purchase.

**Details:**
- `rounded_amount = round(amount)`
- `rounded_off = rounded_amount - amount`
- Shows the rounding difference for accounting accuracy

### 6.11 Hamali Rate Auto-Fetch
**What:** Hamali rate automatically fetched from Hamali Rate Master based on contract date and bag weight.

**Details:**
- Looks up rate history for the most recent effective date ≤ contract date
- Selects rate based on bag weight (≤60 KG or >60 KG)
- Falls back to default 7.50 if master not found
- "Refresh Hamali Rate" action button on saved forms
- Shows alert with fetched rate and bag weight category

### 6.12 Payment Lock for Paid Entries
**What:** Prevents unauthorized modification of paid entries.

**Details:**
- `check_paid_modification()` runs in `before_save`
- If `payment_status == "Paid"` and user doesn't have "System Manager" role → `frappe.PermissionError`
- Only admin users can modify already-paid entries

---

## 7. Bugs Encountered & Solutions

### Bug 1: Form Showing "Not Saved" After Saving

**Problem:** After saving a Grain Purchase form, it immediately showed "Not Saved" status even though the save was successful.

**Root Cause:**
- `calculate_values(frm)` was running on every `refresh` event (including after save) via `setTimeout`, and it called `set_value()` which marked the form as dirty.
- `fetch_tax_balance()` was using `frm.set_value()` for hidden tax display fields, also marking the form dirty after save.

**Solution:**
1. Changed `calculate_values` in refresh to only run for new forms:
   ```javascript
   if (frm.is_new()) {
       setTimeout(function() { calculate_values(frm); }, 500);
   }
   ```
2. Changed `fetch_tax_balance` to use `frm.doc.field = value` + `frm.refresh_fields()` instead of `frm.set_value()`:
   ```javascript
   frm.doc.mandi_tax_paid = mandi_paid;
   frm.doc.mandi_tax_balance = mandi_balance;
   frm.refresh_fields();
   ```

**Lesson:** In Frappe, `frm.set_value()` marks the form dirty (unsaved). Use `frm.doc.field = value` + `frm.refresh_fields()` for display-only fields that shouldn't trigger a save.

---

### Bug 2: Export Traceback - "No data found for A/S flag: S"

**Problem:** When exporting Krishi Upaj Mandi Excel with no matching data, users saw a full Python traceback instead of a friendly message.

**Root Cause:** The export functions used `frappe.throw()` when no data was found. `frappe.throw()` raises an exception, which causes a traceback in API calls.

**Solution:** Changed all 3 export functions (NEFT/RTGS, DTR, Krishi Upaj) to use `frappe.msgprint()` + `return` instead of `frappe.throw()`:

```python
# Before (caused traceback):
frappe.throw(_("No data found for A/S flag: {0}").format(as_flag))

# After (friendly message):
frappe.msgprint(_("No data found for A/S flag: {0}").format(as_flag))
return
```

**Lesson:** Use `frappe.throw()` only for validation errors that should block the operation. Use `frappe.msgprint()` + `return` for informational "no data" messages.

---

### Bug 3: Git Safe Directory Error on Production

**Problem:** `git pull` failed on production server with:
```
fatal: detected dubious ownership in repository at '/home/frappe/frappe-bench/apps/trustbit_mandi'
```

**Root Cause:** Git security feature detects when a repository is owned by a different user than the one running the command (running as root, repo owned by frappe user).

**Solution:**
```bash
git config --global --add safe.directory /home/frappe/frappe-bench/apps/trustbit_mandi
```

---

### Bug 4: Git Remote "origin" Not Found on Production

**Problem:** `git pull origin main` failed on production because the remote was named "upstream", not "origin".

**Solution:** Used the correct remote name:
```bash
git pull upstream main
```

**Lesson:** Always check `git remote -v` before pulling on a new server.

---

### Bug 5: curl Returning 000 After Server Restart

**Problem:** After restarting supervisord services on production, health check via curl returned status 000 (connection refused).

**Root Cause:** Services hadn't fully started yet when the health check ran.

**Solution:** Added `sleep 3` before the health check to allow services to fully initialize.

---

## 8. Server & Deployment Details

### Local Development
- **Path:** `/Users/warroom/frappe-bench-v15`
- **Port:** 8004
- **Site:** mandi.local
- **Start:** `cd frappe-bench-v15 && bench start`
- **URL:** http://mandi.local:8004

### Production Server
- **Host:** 168.231.122.238
- **Bench Path:** `/home/frappe/frappe-bench`
- **Site:** ethanol.trustbit.in
- **Process Manager:** supervisord
- **Git Remote:** `upstream` (not origin)

**Deployment Steps:**
```bash
# SSH into production
ssh root@168.231.122.238

# Pull latest code
cd /home/frappe/frappe-bench/apps/trustbit_mandi
git pull upstream main

# Migrate and restart
cd /home/frappe/frappe-bench
bench --site ethanol.trustbit.in migrate
sudo supervisorctl restart all
```

### Demo Server
- **Host:** 195.35.45.237
- **Bench Path:** `/home/frappe_user/frappe-bench`
- **Site:** demo.trustbit.cloud
- **Note:** Uses `frappe_user` not `frappe` as the system user

---

## 9. Pending / Future Work

| Item | Status | Notes |
|------|--------|-------|
| Grain Mandi Tax Letter format PDF | Waiting for design | Design to come from team |
| Mandi Pakchik Report | Waiting for design | Design to come from Aayush Gupta |

---

## Technical Notes

### JSON File Convention
- All Frappe JSON files (doctypes, print formats, etc.) use **single-space indentation**, not tabs.

### Frappe JS Globals
- Frappe JS files use global objects: `frappe`, `__()`, `flt()`, `format_currency()`, `open_url_post()`
- These files cannot be validated with `node -c` as they depend on Frappe's runtime environment.

### Excel Exports Pattern
- Use `openpyxl` for Excel generation
- Return via:
  ```python
  frappe.response['filename'] = 'filename.xlsx'
  frappe.response['filecontent'] = output.getvalue()
  frappe.response['type'] = 'binary'
  ```
- JS calls via `open_url_post('/api/method/...', filters)`

### Print Format Pattern
- Files: `print_format/<name>/<name>.json` + `<name>.html`
- JSON: `custom_format: 1`, `print_format_type: "Jinja"`, `standard: "Yes"`
- HTML: Use `{{ doc.field_name }}` for field values, `{{ frappe.utils... }}` for utilities

### Script Report Pattern
- Files: `report/<name>/<name>.json` + `.py` + `.js`
- Python: `execute(filters)` returns `(columns, data, message, chart, report_summary)`
- JS: `frappe.query_reports["Report Name"] = { filters: [...], onload: function(report) {...} }`

### Whitelisted API Methods
- Decorator: `@frappe.whitelist()`
- Called from JS: `frappe.call({ method: 'full.dotted.path', args: {...}, callback: function(r) {...} })`
- Or via URL: `open_url_post('/api/method/full.dotted.path', params)`
