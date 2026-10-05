### Trustbit Mandi

Agricultural market (mandi) operations for ERPNext: grain purchase from farmers with mandi tax,
hamali and payment tracking; deals, deliveries and vehicle dispatch for sales; a simple mandi
stock entry linked to ERPNext stock; and the reports a mandi office works from.

Runs on **ERPNext v15 and v16**. The v16 port was done in August 2026; the same `main` branch
serves both.

### What it contains

- **Grain Purchase** (users often call it "Mandi Purchase"): weight, amount, hamali, mandi tax and
  nirashrit tax calculated from masters; payment status and balance. Amounts round half up
  (0.49 → 0, 0.50 → 1) on the form and on the server alike.
- **Masters:** Mandi Tax Type (with a Tax Category and one *Is Default* per category), Hamali Rate
  Master and History, Mandi Bank and Mandi Bank Master, Package Bag Master, Vehicle Master.
- **Tax Payment Record** and **PPS Entry**.
- **Sales side:** Deal, Deal Price List (and Area), Deal Delivery, Vehicle Dispatch with loading,
  payments and petrol coupon.
- **Mandi Stock Entry**, posting to ERPNext Stock Entry.
- **Reports:** Mandi Purchase Report, Mandi Payment Report, Mandi Tax Report, Mandi All In One
  Report, Deal Ledger, Deal Price List Ledger, Deal Delivery Report, Current Stock, Mandi Stock
  Ledger.
- **Desk:** the *Mandi* workspace, with launcher icon, desktop tiles and grouped sidebar on v16.

### Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/zxrrcpandey/Trustbit-Mandi.git --branch main
bench --site $SITE install-app trustbit_mandi
bench --site $SITE migrate
bench build --app trustbit_mandi
```

### After installing

- **Company.** The app never hard-codes a company. It uses Global Defaults › Default Company, or
  the only company if there is exactly one, and stops with a clear message otherwise.
- **Mandi Tax Type.** Create the tax types the site needs and tick **Is Default** on one per Tax
  Category (Mandi Tax, Nirashrit Tax). Grain Purchase fills its tax types from those defaults; no
  tax name or rate is built into the code.
- **Hamali Rate Master** and the bank masters, before the first Grain Purchase.

### Reports and totals

The Mandi Purchase Report and the Mandi Payment Report each end in **one** bold total row, added
by the report itself. Leave the Report's *Add Total Row* option switched off: Frappe's automatic
total would add the report's own total row to the rows above it and show a second, doubled line.

### More detail

`PROJECT_DOCUMENTATION.md` and `REQUIREMENTS.md` describe the app as first written in February
2026. Each starts with a list of what has changed since.

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/trustbit_mandi
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
