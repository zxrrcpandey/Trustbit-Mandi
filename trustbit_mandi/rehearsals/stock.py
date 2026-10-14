"""Rehearsal of the stock that goes with a Deal Delivery and a Mandi Stock Entry: an entry is submitted
only when ERPNext's stock moves with it, and a delivery with nothing on it is refused.

    bench --site <site> execute trustbit_mandi.rehearsals.stock.run

Everything happens in ONE database transaction that is rolled back at the end, so nothing is left
behind: no item, no customer, no entry. Safe on a live site at a quiet moment.
"""

import frappe
from frappe.utils import nowdate

from trustbit_mandi.rehearsals.payment import Rehearsal
from trustbit_mandi.trustbit_mandi.doctype.mandi_stock_entry.mandi_stock_entry import get_default_warehouse, get_kg_uom

STOCKED = "ZZ Mandi Stock Rehearsal Flour"
UNSTOCKED = "ZZ Mandi Stock Rehearsal Service"
PACK = "ZZ Rehearsal 50kg"
CUSTOMER = "ZZ Mandi Stock Rehearsal Customer"


def _item(code, stocked):
	frappe.get_doc({
		"doctype": "Item", "item_code": code, "item_name": code, "item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name"),
		"stock_uom": get_kg_uom(), "is_stock_item": stocked, "include_item_in_manufacturing": 0,
		# India Compliance asks every new item for one
		**({"gst_hsn_code": "11010000"} if frappe.get_meta("Item").has_field("gst_hsn_code") else {}),
	}).insert(ignore_permissions=True)


def _entry(entry_type, item, qty):
	return frappe.get_doc({
		"doctype": "Mandi Stock Entry", "posting_date": nowdate(), "entry_type": entry_type, "warehouse": get_default_warehouse(),
		"items": [{"item": item, "pack_size": PACK, "pack_weight_kg": 50, "qty": qty}],
	}).insert(ignore_permissions=True)


def _delivery(rows):
	return frappe.get_doc({
		"doctype": "Deal Delivery", "delivery_date": nowdate(), "customer": CUSTOMER,
		"items": [{"item": item, "pack_size": PACK, "pack_weight_kg": 50, "deliver_qty": qty, "rate": 1000} for item, qty in rows],
	}).insert(ignore_permissions=True)


def _submitted_with(item):
	return frappe.db.sql("""select e.name from `tabMandi Stock Entry` e join `tabMandi Stock Entry Item` i on i.parent = e.name
		where e.docstatus = 1 and i.item = %s""", item, pluck=True)


def _stock(item):
	return frappe.db.get_value("Bin", {"item_code": item, "warehouse": get_default_warehouse()}, "actual_qty") or 0


def run():
	t = Rehearsal()
	frappe.set_user("Administrator")
	frappe.flags.mute_emails = True
	try:
		t.check("0  the site has a Mandi warehouse", bool(get_default_warehouse()), get_default_warehouse())
		_item(STOCKED, 1)
		_item(UNSTOCKED, 0)
		frappe.get_doc({"doctype": "Deal Pack Size", "pack_size_name": PACK, "weight_kg": 50, "is_active": 1}).insert(ignore_permissions=True)
		frappe.get_doc({"doctype": "Customer", "customer_name": CUSTOMER, "customer_type": "Company"}).insert(ignore_permissions=True)

		# a receipt brings 10 bags in, and ERPNext's stock with it
		receipt = _entry("Receipt", STOCKED, 10)
		receipt.submit()
		t.check("1  a receipt is submitted with its ERPNext Stock Entry, and 500 kg are in stock",
			bool(receipt.erp_stock_entry) and frappe.db.get_value("Stock Entry", receipt.erp_stock_entry, "docstatus") == 1 and _stock(STOCKED) == 500,
			[receipt.erp_stock_entry, _stock(STOCKED)])

		# what used to be submitted with only an orange note
		t.refused("2  issuing an item that is not a stock item", lambda: _entry("Issue", UNSTOCKED, 1).submit(), "not submitted")
		t.check("3  and no Mandi Stock Entry of it is left submitted",
			not _submitted_with(UNSTOCKED), _submitted_with(UNSTOCKED))
		t.refused("4  issuing more than ERPNext holds (11 bags of 10)", lambda: _entry("Issue", STOCKED, 11).submit(), "not submitted")
		t.check("5  the stock is still 500 kg", _stock(STOCKED) == 500, _stock(STOCKED))

		# a delivery
		t.refused("6  a delivery with no item on it", lambda: _delivery([]), "Add at least one item")
		t.refused("7  a delivery of the item that is not a stock item: not submitted", lambda: _delivery([(UNSTOCKED, 1)]).submit(), "not submitted")
		bad = frappe.get_all("Deal Delivery", filters={"customer": CUSTOMER, "docstatus": 1}, pluck="name")
		t.check("8  no delivery of the rehearsal's customer is submitted", not bad, bad)

		good = _delivery([(STOCKED, 4)])
		good.submit()
		issue = frappe.db.get_value("Mandi Stock Entry", {"deal_delivery": good.name, "docstatus": 1}, ["name", "erp_stock_entry"], as_dict=True)
		t.check("9  a delivery of 4 bags in stock is submitted, its Mandi entry and ERPNext's with it; 300 kg are left",
			bool(issue and issue.erp_stock_entry) and _stock(STOCKED) == 300, [issue, _stock(STOCKED)])

		good.reload()
		good.cancel()
		t.check("10 cancelling the delivery cancels both entries and the 200 kg come back",
			frappe.db.get_value("Mandi Stock Entry", issue.name, "docstatus") == 2
			and frappe.db.get_value("Stock Entry", issue.erp_stock_entry, "docstatus") == 2 and _stock(STOCKED) == 500,
			_stock(STOCKED))
	except Exception:
		t.check("the rehearsal itself ran to the end", False, frappe.get_traceback()[-600:])
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")

	for status, label, detail in t.rows:
		print(f"  {status} | {label}")
		if detail not in ("", None):
			print(f"         -> {detail}")
	left = frappe.db.exists("Item", STOCKED) or frappe.db.exists("Customer", CUSTOMER)
	print(f"\n{len(t.rows) - t.failed} of {len(t.rows)} passed. Left behind: {bool(left)}")
