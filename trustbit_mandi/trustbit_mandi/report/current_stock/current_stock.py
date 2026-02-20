import frappe
from frappe.utils import flt, getdate, add_days


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	report_summary = get_report_summary(data)
	return columns, data, None, None, report_summary


def get_columns():
	return [
		{"fieldname": "sno", "label": "S.No.", "fieldtype": "Int", "width": 50},
		{"fieldname": "item", "label": "Item", "fieldtype": "Link", "options": "Item", "width": 150},
		{"fieldname": "item_name", "label": "Item Name", "fieldtype": "Data", "width": 150},
		{"fieldname": "pack_size", "label": "Pack Size", "fieldtype": "Link", "options": "Deal Pack Size", "width": 100},
		{"fieldname": "pack_weight_kg", "label": "Wt/Pack (KG)", "fieldtype": "Float", "width": 90},
		{"fieldname": "opening", "label": "Opening", "fieldtype": "Float", "width": 80},
		{"fieldname": "received", "label": "Received", "fieldtype": "Float", "width": 80},
		{"fieldname": "issued", "label": "Issued", "fieldtype": "Float", "width": 80},
		{"fieldname": "adjusted", "label": "Adjusted", "fieldtype": "Float", "width": 80},
		{"fieldname": "balance_qty", "label": "Balance (Packs)", "fieldtype": "Float", "width": 110},
		{"fieldname": "balance_kg", "label": "Balance (KG)", "fieldtype": "Float", "width": 110},
	]


def get_data(filters):
	conditions = ["mse.docstatus = 1"]
	values = {}

	from_date = filters.get("from_date") if filters else None
	to_date = filters.get("to_date") if filters else None
	item = filters.get("item") if filters else None
	pack_size = filters.get("pack_size") if filters else None

	if item:
		conditions.append("msei.item = %(item)s")
		values["item"] = item
	if pack_size:
		conditions.append("msei.pack_size = %(pack_size)s")
		values["pack_size"] = pack_size

	if from_date and to_date:
		# With date range: opening = balance before from_date, movements within range
		opening_date = add_days(getdate(from_date), -1)
		values["from_date"] = from_date
		values["to_date"] = to_date
		values["opening_date"] = str(opening_date)

		# Get all item+pack_size combos that have any movement
		item_filter = ""
		if item:
			item_filter += " AND msei.item = %(item)s"
		if pack_size:
			item_filter += " AND msei.pack_size = %(pack_size)s"

		data = frappe.db.sql(
			"""
			SELECT
				msei.item,
				MAX(msei.item_name) as item_name,
				msei.pack_size,
				MAX(msei.pack_weight_kg) as pack_weight_kg,

				COALESCE(SUM(CASE WHEN mse.posting_date <= %(opening_date)s THEN
					CASE WHEN mse.entry_type IN ('Opening Stock', 'Receipt', 'Adjustment (Increase)')
						THEN msei.qty ELSE -msei.qty END
					ELSE 0 END), 0) as opening,

				COALESCE(SUM(CASE WHEN mse.posting_date BETWEEN %(from_date)s AND %(to_date)s
					AND mse.entry_type = 'Receipt' THEN msei.qty ELSE 0 END), 0) as received,

				COALESCE(SUM(CASE WHEN mse.posting_date BETWEEN %(from_date)s AND %(to_date)s
					AND mse.entry_type = 'Issue' THEN msei.qty ELSE 0 END), 0) as issued,

				COALESCE(SUM(CASE WHEN mse.posting_date BETWEEN %(from_date)s AND %(to_date)s
					AND mse.entry_type IN ('Adjustment (Increase)', 'Adjustment (Decrease)') THEN
					CASE WHEN mse.entry_type = 'Adjustment (Increase)' THEN msei.qty ELSE -msei.qty END
					ELSE 0 END), 0) as adjusted,

				COALESCE(SUM(CASE WHEN mse.posting_date <= %(to_date)s THEN
					CASE WHEN mse.entry_type IN ('Opening Stock', 'Receipt', 'Adjustment (Increase)')
						THEN msei.qty ELSE -msei.qty END
					ELSE 0 END), 0) as balance_qty

			FROM `tabMandi Stock Entry Item` msei
			INNER JOIN `tabMandi Stock Entry` mse ON mse.name = msei.parent
			WHERE mse.docstatus = 1 {item_filter}
			GROUP BY msei.item, msei.pack_size
			ORDER BY msei.item ASC, MAX(msei.pack_weight_kg) ASC
		""".format(
				item_filter=item_filter
			),
			values,
			as_dict=True,
		)
	else:
		# No date range: show all-time balance
		date_filter = ""
		if to_date:
			date_filter = " AND mse.posting_date <= %(to_date)s"
			values["to_date"] = to_date

		data = frappe.db.sql(
			"""
			SELECT
				msei.item,
				MAX(msei.item_name) as item_name,
				msei.pack_size,
				MAX(msei.pack_weight_kg) as pack_weight_kg,

				COALESCE(SUM(CASE WHEN mse.entry_type = 'Opening Stock'
					THEN msei.qty ELSE 0 END), 0) as opening,

				COALESCE(SUM(CASE WHEN mse.entry_type = 'Receipt'
					THEN msei.qty ELSE 0 END), 0) as received,

				COALESCE(SUM(CASE WHEN mse.entry_type = 'Issue'
					THEN msei.qty ELSE 0 END), 0) as issued,

				COALESCE(SUM(CASE WHEN mse.entry_type IN ('Adjustment (Increase)', 'Adjustment (Decrease)') THEN
					CASE WHEN mse.entry_type = 'Adjustment (Increase)' THEN msei.qty ELSE -msei.qty END
					ELSE 0 END), 0) as adjusted,

				COALESCE(SUM(
					CASE WHEN mse.entry_type IN ('Opening Stock', 'Receipt', 'Adjustment (Increase)')
						THEN msei.qty ELSE -msei.qty END
				), 0) as balance_qty

			FROM `tabMandi Stock Entry Item` msei
			INNER JOIN `tabMandi Stock Entry` mse ON mse.name = msei.parent
			WHERE mse.docstatus = 1 {date_filter} {conditions}
			GROUP BY msei.item, msei.pack_size
			ORDER BY msei.item ASC, MAX(msei.pack_weight_kg) ASC
		""".format(
				date_filter=date_filter,
				conditions=(" AND " + " AND ".join(conditions[1:])) if len(conditions) > 1 else "",
			),
			values,
			as_dict=True,
		)

	# Add S.No. and balance_kg
	for i, row in enumerate(data, 1):
		row["sno"] = i
		row["balance_kg"] = flt(row["balance_qty"]) * flt(row["pack_weight_kg"])

	return data


def get_report_summary(data):
	total_balance = sum(flt(r.get("balance_qty")) for r in data)
	total_balance_kg = sum(flt(r.get("balance_kg")) for r in data)
	items_count = len(data)
	negative_count = len([r for r in data if flt(r.get("balance_qty")) < 0])

	return [
		{"value": items_count, "label": "Item-Pack Combos", "datatype": "Int", "indicator": "Blue"},
		{"value": total_balance, "label": "Total Balance (Packs)", "datatype": "Float", "indicator": "Green"},
		{"value": total_balance_kg, "label": "Total Balance (KG)", "datatype": "Float", "indicator": "Blue"},
		{
			"value": negative_count,
			"label": "Negative Stock",
			"datatype": "Int",
			"indicator": "Red" if negative_count > 0 else "Green",
		},
	]
