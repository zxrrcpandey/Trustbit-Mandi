import frappe
from frappe.utils import flt


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"fieldname": "sno", "label": "S.No.", "fieldtype": "Int", "width": 50},
		{"fieldname": "posting_date", "label": "Date", "fieldtype": "Date", "width": 100},
		{"fieldname": "entry_type", "label": "Entry Type", "fieldtype": "Data", "width": 140},
		{"fieldname": "voucher", "label": "Voucher", "fieldtype": "Link", "options": "Mandi Stock Entry", "width": 170},
		{"fieldname": "item", "label": "Item", "fieldtype": "Link", "options": "Item", "width": 140},
		{"fieldname": "item_name", "label": "Item Name", "fieldtype": "Data", "width": 140},
		{"fieldname": "pack_size", "label": "Pack Size", "fieldtype": "Link", "options": "Deal Pack Size", "width": 90},
		{"fieldname": "qty_in", "label": "Qty In", "fieldtype": "Float", "width": 80},
		{"fieldname": "qty_out", "label": "Qty Out", "fieldtype": "Float", "width": 80},
		{"fieldname": "balance", "label": "Balance (Packs)", "fieldtype": "Float", "width": 110},
		{"fieldname": "balance_kg", "label": "Balance (KG)", "fieldtype": "Float", "width": 110},
		{"fieldname": "supplier_name", "label": "Supplier", "fieldtype": "Data", "width": 130},
		{"fieldname": "deal_delivery", "label": "Deal Delivery", "fieldtype": "Link", "options": "Deal Delivery", "width": 150},
		{"fieldname": "remarks", "label": "Remarks", "fieldtype": "Data", "width": 150},
	]


def get_data(filters):
	conditions = ["mse.docstatus = 1"]
	values = {}

	from_date = filters.get("from_date") if filters else None
	to_date = filters.get("to_date") if filters else None
	item = filters.get("item") if filters else None
	pack_size = filters.get("pack_size") if filters else None

	if from_date:
		conditions.append("mse.posting_date >= %(from_date)s")
		values["from_date"] = from_date
	if to_date:
		conditions.append("mse.posting_date <= %(to_date)s")
		values["to_date"] = to_date
	if item:
		conditions.append("msei.item = %(item)s")
		values["item"] = item
	if pack_size:
		conditions.append("msei.pack_size = %(pack_size)s")
		values["pack_size"] = pack_size

	rows = frappe.db.sql(
		"""
		SELECT
			mse.posting_date,
			mse.entry_type,
			mse.name as voucher,
			msei.item,
			msei.item_name,
			msei.pack_size,
			msei.pack_weight_kg,
			msei.qty,
			mse.supplier_name,
			mse.deal_delivery,
			mse.remarks
		FROM `tabMandi Stock Entry Item` msei
		INNER JOIN `tabMandi Stock Entry` mse ON mse.name = msei.parent
		WHERE {conditions}
		ORDER BY mse.posting_date ASC, mse.creation ASC, msei.idx ASC
	""".format(
			conditions=" AND ".join(conditions)
		),
		values,
		as_dict=True,
	)

	IN_TYPES = ("Opening Stock", "Receipt", "Adjustment (Increase)")

	# Calculate running balance per (item, pack_size)
	balance_map = {}
	data = []
	for i, row in enumerate(rows, 1):
		key = (row.item, row.pack_size)
		if key not in balance_map:
			balance_map[key] = 0

		is_in = row.entry_type in IN_TYPES
		row["qty_in"] = row.qty if is_in else 0
		row["qty_out"] = row.qty if not is_in else 0

		net = row.qty if is_in else -row.qty
		balance_map[key] += net
		row["balance"] = balance_map[key]
		row["balance_kg"] = flt(balance_map[key]) * flt(row.pack_weight_kg)
		row["sno"] = i

		data.append(row)

	return data
