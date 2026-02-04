# Trustbit Mandi - Requirements Document

## Overview
Custom ERPNext app for Agricultural Market (Mandi) Operations - Grain purchase, tax management, and payment processing.

---

## DocTypes Analysis (from Demo Server)

### 1. Grain Purchase (Main Transaction)
**Purpose:** Core transaction DocType for recording grain purchases from farmers

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| **Transaction Details** ||||
| transaction_no | Data | Read Only | Auto-generated transaction number |
| contract_number | Data | | Contract reference |
| contract_date | Date | Today | Date of contract |
| as_flag | Select | A / S | A/S Flag |
| **Farmer Details** ||||
| farmer_name | Data | Mandatory | Name of the farmer |
| address | Small Text | | Farmer's address |
| phone_number | Data | | Contact number |
| vehicle_number | Data | | Vehicle details |
| gsm | Select | गेहूं, चावल, मक्का/भुट्टा, जौ, बाजरा वर्ग, बाजरा, मूंग | Grain type (GSM) |
| **Product Details** ||||
| kg_of_bag | Float | 60 | Weight per bag in KG |
| expected_bag | Float | | Expected number of bags |
| actual_bag | Float | | Actual bags received |
| nos_kg | Float | 0 | Extra weight in KG |
| actual_weight | Float | Read Only | Total weight in Quintal |
| auction_rate | Currency | | Rate per Quintal |
| amount | Currency | Read Only | Gross amount |
| **Hamali (Labor) Details** ||||
| hamali_rate | Currency | 7.50 | Hamali rate per bag |
| hamali_rate_master_ref | Link | Hamali Rate Master | Reference to rate master |
| hamali_rate_include | Check | 0 | Is hamali included in rate? |
| hamali | Currency | Read Only | Total hamali amount |
| net_amount | Currency | Read Only | Net payable amount |
| **Tax Calculation** ||||
| mandi_tax_rate | Percent | 1 | Mandi tax percentage |
| mandi_tax | Currency | Read Only | Calculated mandi tax |
| nirashrit_tax_rate | Percent | 0.2 | Nirashrit tax percentage |
| nirashrit_tax | Currency | Read Only | Calculated nirashrit tax |
| total_tax | Currency | Read Only | Total tax liability |
| **Tax Balance Status** ||||
| tax_balance_html | HTML | | Dashboard display |
| mandi_tax_paid | Currency | Hidden | Tax already paid |
| mandi_tax_balance | Currency | Hidden | Remaining tax balance |
| nirashrit_tax_paid | Currency | Hidden | Nirashrit tax paid |
| nirashrit_tax_balance | Currency | Hidden | Nirashrit tax balance |
| **Payment Details** ||||
| payment_status | Select | Pending/Paid/Partial/Cancelled | Payment status |
| pay_date | Date | Today | Payment date |
| payment_mode | Select | Cash/Bank Transfer/Cheque/UPI/NEFT/RTGS | Mode of payment |
| payment_details | Small Text | | Additional payment info |
| bank_account | Link | Mandi Bank Master | Bank account reference |
| bank_name | Data | | Bank name |
| account_number | Data | | Account number |
| branch | Data | | Branch name |
| ifsc_code | Data | | IFSC code |

**Naming:** `GPD-{DD}-{MM}-{YYYY}-{####}`

---

### 2. Tax Payment Record (Submittable)
**Purpose:** Record tax deposits to government

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| **Tax Deposit Details** ||||
| tax_deposit_for | Select | Mandi / Chaupal | Tax deposit category |
| deposit_date | Date | Today, Mandatory | Date of deposit |
| **Tax Payment Info** ||||
| tax_type | Select | Mandi Tax / Nirashrit Tax | Type of tax |
| amount | Currency | Mandatory | Tax amount |
| **Bank Details** ||||
| bank_account | Link | Mandi Bank Master | Bank account |
| bank_name | Data | Mandatory | Bank name |
| branch | Data | | Branch |
| account_no | Data | | Account number |
| ifsc_code | Data | | IFSC code |
| **Payment Info** ||||
| payment_mode | Select | Cheque/DD/NEFT/RTGS | Payment mode |
| utr_no | Data | | UTR/Reference number |
| receive_date | Date | Today | Receipt date |
| receive_no | Data | | Receipt number |
| **Status** ||||
| status | Select | Draft/Submitted/Paid/Cleared/Cancelled | Current status |
| remarks | Small Text | | Notes |
| amended_from | Link | Tax Payment Record | Amendment reference |
| amendment_date | Date | | Amendment date |

**Naming:** `TAX-ENT-{YY}-{MM}-{DD}-{####}`
**Submittable:** Yes

---

### 3. PPS Entry (Purchase Payment Slip) - Submittable
**Purpose:** Generate payment slips/cheques for farmer payments

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| **Basic Info** ||||
| naming_series | Select | PPS-.YYYY.- | Series |
| posting_date | Date | Today | Posting date |
| branch | Data | | Branch |
| status | Select | Draft/Processed/Submitted to Bank/Cancelled | Status |
| **Cheque Details** ||||
| cheque_number | Data | Mandatory | Cheque number |
| cheque_date | Date | Mandatory | Cheque date |
| beneficiary_name | Data | | Payee name |
| purpose | Data | | Purpose of payment |
| **Amount** ||||
| amount | Currency | Mandatory | Payment amount |
| amount_in_words | Data | Read Only | Amount in words |
| **Account Holder Details** ||||
| account_holder | Data | | Account holder name |
| account_number | Data | | Account number |
| account_type | Select | C/C A/C / Savings A/C / Current A/C / OD A/C | Account type |
| bank | Link | Mandi Bank Master | Bank reference |
| bank_name | Data | | Bank name |
| bank_branch | Data | | Bank branch |
| ifsc_code | Data | | IFSC code |
| micr_code | Data | | MICR code |
| **Contact** ||||
| pan_number | Data | | PAN number |
| mobile_number | Data | | Mobile number |
| **Remarks** ||||
| remarks | Small Text | | Notes |

**Naming:** `PPS-.YYYY.-`
**Submittable:** Yes

---

### 4. Mandi Bank Master
**Purpose:** Master data for bank accounts used in Mandi operations

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| tax_type | Link | Mandi Tax Type | Associated tax type |
| bank | Link | Mandi Bank | Bank reference |
| **Bank Details** ||||
| bank_name | Data | Mandatory | Bank name |
| account_number | Data | Unique, Mandatory | Account number |
| branch | Data | Mandatory | Branch name |
| ifsc_code | Data | Mandatory | IFSC code |
| **Additional Info** ||||
| account_holder_name | Data | | Account holder |
| account_type | Select | Savings / Current | Account type |
| is_active | Check | 0 | Active status |
| remarks | Small Text | | Notes |

**Naming:** `BANK-{####}`
**Title Field:** bank_name
**Search Fields:** bank_name, account_number, ifsc_code

---

### 5. Mandi Bank
**Purpose:** Simple bank name master

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| bank_name | Data | Unique, Mandatory | Bank name |
| bank_code | Data | | Bank code |
| is_active | Check | 1 | Active status |

**Naming:** `format:{bank_name}`
**Quick Entry:** Yes

---

### 6. Mandi Tax Type
**Purpose:** Types of taxes applicable in Mandi

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| tax_type_name | Data | Unique, Mandatory | Tax type name |
| description | Small Text | | Description |
| is_active | Check | 1 | Active status |

**Naming:** `format:{tax_type_name}`
**Quick Entry:** Yes

---

### 7. Hamali Rate Master
**Purpose:** Configure labor/handling charges (Hamali) rates

| Field | Type | Options/Default | Description |
|-------|------|-----------------|-------------|
| hamali_for | Select | Mandi/Choupal/Other | Rate category |
| is_active | Check | 1 | Active status |
| **Current Rate** ||||
| effective_date | Datetime | Today, Mandatory | Rate effective from |
| upto_60_kg | Currency | 0, Mandatory | Rate for bags ≤60 KG |
| more_than_60_kg | Currency | 0, Mandatory | Rate for bags >60 KG |
| **History** ||||
| rate_history | Table | Hamali Rate History | Historical rates |

**Naming:** `format:{hamali_for}`

---

### 8. Hamali Rate History (Child Table)
**Purpose:** Track historical hamali rates

| Field | Type | Description |
|-------|------|-------------|
| effective_date | Datetime | When rate was effective |
| upto_60_kg | Currency | Rate for ≤60 KG |
| more_than_60_kg | Currency | Rate for >60 KG |

**Parent:** Hamali Rate Master

---

## Business Logic & Calculations

### Grain Purchase Calculations
```
actual_weight = (actual_bag × kg_of_bag + nos_kg) / 100  [in Quintal]
amount = actual_weight × auction_rate
hamali = actual_bag × hamali_rate (if not included)
mandi_tax = amount × mandi_tax_rate / 100
nirashrit_tax = amount × nirashrit_tax_rate / 100
total_tax = mandi_tax + nirashrit_tax
net_amount = amount - hamali (if hamali deducted)
```

### Tax Rates (Default)
- **Mandi Tax:** 1%
- **Nirashrit Tax:** 0.2%

### Hamali Rate Logic
- Different rates based on bag weight (≤60 KG vs >60 KG)
- Can be included in auction rate or charged separately
- Historical tracking for rate changes

---

## Reports Required

1. **Mandi Payment Report** - All payments made to farmers
2. **Mandi Tax Report V2** - Tax liability and payments
3. **Mandi Purchase Report** - All grain purchases

---

## Workflow States

### Grain Purchase
`Draft → Pending Payment → Paid → Completed`

### Tax Payment Record
`Draft → Submitted → Paid → Cleared`

### PPS Entry
`Draft → Processed → Submitted to Bank → Completed/Cancelled`

---

## Integration Points

- Link to **Mandi Bank Master** for payment processing
- Link to **Hamali Rate Master** for automatic rate fetching
- Tax balance tracking across multiple purchases

---

## Notes

- All currency fields use INR
- Grain types are in Hindi (regional requirement)
- Tax calculations are automatic based on rates
- Hamali rates vary by bag weight category
- Amendment support for Tax Payment Records

---

## Client Scripts

### 1. GrainPurchaseDemoCalculation (Core Business Logic)
**DocType:** Grain Purchase
**Purpose:** Main calculation engine for grain purchases

#### Features:
- **Transaction Number Auto-Generation:** Creates unique `TXN-YYYY-MM-DD-#####` on new documents
- **Default Tax Rates:** Sets Mandi Tax (1%) and Nirashrit Tax (0.2%) on new documents
- **Hamali Rate Fetching:** Fetches from Hamali Rate Master based on:
  - Contract date (finds applicable rate from history)
  - Bag weight (≤60 KG vs >60 KG rates)
- **Bank Details Auto-Fill:** Populates bank info when bank_account is selected

#### Calculation Logic:
```javascript
// Weight Calculation
actual_weight = (actual_bags × kg_of_bag / 100) + (nos_kg / 100)  // in Quintal

// Amount Calculation
amount = auction_rate × actual_weight

// Hamali Calculation
if (hamali_rate_include) {
    hamali = 0
    net_amount = amount
} else {
    total_bags_for_hamali = actual_bags + (nos_kg / 100)
    hamali = total_bags_for_hamali × hamali_rate
    net_amount = amount - hamali
}

// Tax Calculations
mandi_tax = (amount × mandi_tax_rate) / 100
nirashrit_tax = (amount × nirashrit_tax_rate) / 100
total_tax = mandi_tax + nirashrit_tax
```

#### Tax Balance Dashboard:
- Displays real-time tax balance in HTML field
- Shows: Mandi Tax Paid/Liability/Balance and Nirashrit Tax Paid/Liability/Balance
- Color-coded: Green (advance available), Red (payment required)
- Warns when balance will go negative after purchase

#### Custom Buttons:
- **Refresh Hamali Rate** - Re-fetches rate from master
- **View Tax Balance** - Opens detailed dialog with tax summary

---

### 2. PPS Entry - Auto Fill
**DocType:** PPS Entry
**Purpose:** Automate PPS form filling

#### Features:
- **Amount to Words Conversion:** Indian number system (Crore, Lakh, Thousand)
- **Bank Details Auto-Fill:** Fetches from Mandi Bank Master:
  - bank_name, bank_branch, ifsc_code, micr_code, account_number
- **Cheque Date Default:** Sets cheque_date = posting_date
- **Print Button:** Quick print action button

#### Amount to Words Format:
```
1,23,45,678 → ONE CRORE TWENTY THREE LAKH FORTY FIVE THOUSAND SIX HUNDRED SEVENTY EIGHT ONLY
```

---

### 3. Tax Payment Record
**DocType:** Tax Payment Record
**Purpose:** Auto-fill bank details

#### Features:
- **Bank Details Auto-Fill:** When bank_account is selected:
  - bank_name, branch, account_no, ifsc_code
- **Alert:** Shows "Bank details loaded" on successful fetch
- **Clear Fields:** Clears all bank fields when bank_account is cleared

---

### 4. Hamali Rate Master History
**DocType:** Hamali Rate Master
**Purpose:** Automatically track rate changes

#### Features:
- **Auto-Add to History:** On before_save, adds current rate to rate_history child table
- **Duplicate Prevention:** Checks if exact rate already exists in history
- **Sort History:** Displays newest rates first on refresh
- **Alert:** Shows "Rate added to history: {date}" on new entry

---

### 5. Save and Print
**DocType:** Grain Purchase
**Purpose:** Quick save and print functionality

#### Features:
- **Save Button:** Quick save action
- **Save & Print Button:** Saves document then triggers print dialog
- Available for both new and existing documents

---

## Reports

### 1. Mandi Payment Report (Script Report)
**Ref DocType:** Grain Purchase
**Purpose:** Comprehensive payment report with beautiful PDF generation

#### Filters:
| Filter | Type | Options |
|--------|------|---------|
| from_date | Date | Payment Date From |
| to_date | Date | Payment Date To |
| payment_status | Select | Paid/Pending/Partial |
| payment_mode | Select | Cash/Cheque/RTGS/NEFT/Bank Transfer |
| gsm | Data | Commodity filter |

#### Columns:
S.No., Contract Date, Contract No., Farmer Name, Address, Phone, Transaction No., Exp. Bag, Actual Bag, Rate, Actual Weight, Amount, Hamali, Net Amount, Commodity, Payment Status

#### Features:
- Groups data by GSM (commodity)
- GSM subtotals and Grand Total row
- Report Summary cards (Total Net Amount, Total Amount, Total Hamali, Total Weight)
- **Custom PDF Print Button** with:
  - Beautiful gradient styling
  - Purchase Date Wise Payment Summary (Page 2)
  - Color-coded cells
  - Indian number formatting

---

### 2. Mandi Purchase Report (Script Report)
**Ref DocType:** Grain Purchase
**Purpose:** Track all grain purchases

#### Filters:
| Filter | Type | Required |
|--------|------|----------|
| from_date | Date | Yes |
| to_date | Date | Yes |
| farmer_name | Data | No |

#### Columns:
S.No., Farmer Name, Address, Phone, Contract Date, Contract No., Exp. Bag, Transaction No., Actual Bag, Actual Weight, Rate, Amount

#### Features:
- Auto-calculates totals
- **Print PDF Button** with A4 landscape layout
- Hindi company name in header
- Farmer name & address combined cell

---

### 3. Mandi Tax Report V2 (Script Report)
**Ref DocType:** Grain Purchase
**Purpose:** Tax liability and payment tracking for government compliance

#### Filters:
| Filter | Type | Options |
|--------|------|---------|
| period | Select | Monthly/Quarterly/Half-Yearly/Yearly |
| from_date | Date | Auto-calculated from period |
| to_date | Date | Auto-calculated from period |
| tax_deposit_for | Select | Mandi/Chaupal |
| tax_type | Select | Mandi Tax/Nirashrit Tax |

#### Columns:
Deposit Date, Tax Deposit For, Tax Type, Amount, Payment Mode, UTR No, Receive No, Status

#### Features:
- **Bar Chart** showing Mandi Tax vs Nirashrit Tax paid
- Report Summary cards (Total Paid, Mandi Tax, Nirashrit Tax)
- **Custom PDF Print Button** with:
  - Hindi government form format (कृषि उपज मंडी समिति)
  - Daily purchase aggregation
  - Tax payment details with receipt numbers
  - Balance calculation (Paid - Liability)
  - Three-column summary layout

---

### 4. Tax Payment Details (Query Report)
**Ref DocType:** Tax Payment Record
**Purpose:** Simple tax payment listing

#### Filters:
| Filter | Type | Default |
|--------|------|---------|
| from_date | Date | Today |
| to_date | Date | Today |
| tax_deposit_for | Select | Mandi/Chaupal |

#### Query:
```sql
SELECT name, deposit_date, tax_deposit_for, tax_type, amount,
       bank_name, payment_mode, status
FROM `tabTax Payment Record`
WHERE docstatus < 2
  AND deposit_date BETWEEN %(from_date)s AND %(to_date)s
ORDER BY deposit_date DESC
```

---

### 5. Tax Payment Details Report (Script Report)
**Ref DocType:** Tax Payment Record
**Purpose:** Full-featured tax payment report with advanced filtering

#### Filters:
| Filter | Type | Options |
|--------|------|---------|
| from_date | Date | |
| to_date | Date | |
| tax_deposit_for | Select | Mandi/Chaupal |
| tax_type | Select | Mandi Tax/Nirashrit Tax |
| payment_mode | Select | Cheque/Demand Draft/NEFT/RTGS |
| status | Select | Draft/Submitted/Paid/Cleared/Cancelled |

#### Columns:
ID (Link), Deposit Date, Tax For, Tax Type, Amount, Bank Name, Branch, Payment Mode, UTR No., Receive Date, Receive No., Status

---

## Key Helper Functions

### Indian Number Formatting
```javascript
function format_number(num) {
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}
```

### Float Parsing with Default
```javascript
function flt(value, default_value) {
    if (value === null || value === undefined || value === '')
        return default_value || 0;
    let num = parseFloat(value);
    return isNaN(num) ? (default_value || 0) : num;
}
```

---

*Last Updated: 2026-02-05*
*Source: Demo Server DocType Export, Client Script Export & Report Export*
