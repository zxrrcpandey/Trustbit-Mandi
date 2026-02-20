"""Integrate Mandi Stock Entry with ERPNext stock module.

- Ensure items have is_stock_item=1 and stock_uom=Kg
- Create warehouses (Stores, Dispatch)
- Enable allow_negative_stock
- Set warehouse on existing Mandi Stock Entries
- Create ERPNext Stock Entries for existing submitted entries
"""
import frappe
from frappe.utils import flt


def execute():
	company = "Trustbit Mandi"
	if not frappe.db.exists("Company", company):
		frappe.log_error(title="Patch: Company not found", message=company)
		return

	abbr = frappe.db.get_value("Company", company, "abbr")
	if not abbr:
		frappe.log_error(title="Patch: Company abbreviation not found", message=company)
		return

	uom_name = ensure_uom_exists()
	update_items_for_stock(uom_name)
	create_warehouses(company, abbr)
	enable_negative_stock()

	default_wh = "Stores - {0}".format(abbr)
	set_default_warehouse_on_existing(default_wh, company)
	create_erp_stock_entries_for_existing()

	frappe.db.commit()


def ensure_uom_exists():
	"""Ensure a KG UOM exists and return its name."""
	if frappe.db.exists("UOM", "Kg"):
		return "Kg"
	if frappe.db.exists("UOM", "KG"):
		return "KG"
	# Create it
	frappe.get_doc({"doctype": "UOM", "uom_name": "Kg"}).insert(ignore_permissions=True)
	return "Kg"


def update_items_for_stock(uom_name):
	"""Set is_stock_item=1 and stock_uom for all items used in Mandi."""
	all_items = set()

	for table in ["tabMandi Stock Entry Item", "tabDeal Item", "tabDeal Delivery Item"]:
		if frappe.db.table_exists(table):
			items = frappe.db.sql_list(
				"SELECT DISTINCT item FROM `{0}` WHERE item IS NOT NULL AND item != ''".format(table)
			)
			all_items.update(items)

	for item_code in all_items:
		if not frappe.db.exists("Item", item_code):
			continue
		frappe.db.set_value(
			"Item", item_code,
			{"is_stock_item": 1, "stock_uom": uom_name},
			update_modified=False,
		)


def create_warehouses(company, abbr):
	"""Create Stores and Dispatch warehouses under the company."""
	parent_wh = "{0} - {1}".format(company, abbr)

	# Ensure parent group warehouse exists
	if not frappe.db.exists("Warehouse", parent_wh):
		frappe.get_doc({
			"doctype": "Warehouse",
			"warehouse_name": company,
			"is_group": 1,
			"company": company,
		}).insert(ignore_permissions=True)

	for wh_name in ["Stores", "Dispatch"]:
		full_name = "{0} - {1}".format(wh_name, abbr)
		if not frappe.db.exists("Warehouse", full_name):
			frappe.get_doc({
				"doctype": "Warehouse",
				"warehouse_name": wh_name,
				"is_group": 0,
				"parent_warehouse": parent_wh,
				"company": company,
			}).insert(ignore_permissions=True)


def enable_negative_stock():
	"""Enable allow_negative_stock in Stock Settings."""
	frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)


def set_default_warehouse_on_existing(default_wh, company):
	"""Set warehouse and company on all existing Mandi Stock Entries."""
	if not frappe.db.exists("Warehouse", default_wh):
		return

	frappe.db.sql("""
		UPDATE `tabMandi Stock Entry`
		SET warehouse = %s, company = %s
		WHERE (warehouse IS NULL OR warehouse = '')
	""", (default_wh, company))


def create_erp_stock_entries_for_existing():
	"""Create ERPNext Stock Entries for submitted MSEs that don't have one."""
	entries = frappe.db.sql("""
		SELECT name
		FROM `tabMandi Stock Entry`
		WHERE docstatus = 1
		  AND (erp_stock_entry IS NULL OR erp_stock_entry = '')
		ORDER BY posting_date ASC, creation ASC
	""", as_dict=True)

	for entry in entries:
		try:
			mse = frappe.get_doc("Mandi Stock Entry", entry.name)
			mse.create_erp_stock_entry()
		except Exception:
			frappe.log_error(
				title="Patch: ERPNext SE creation failed for {0}".format(entry.name)
			)
