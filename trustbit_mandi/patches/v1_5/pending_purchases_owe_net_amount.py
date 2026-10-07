import frappe

PAYMENT_ROLE = "Mandi Accounts"


def execute():
	"""A Pending Grain Purchase owes its whole Net Amount, whatever was typed into Paid Amount.

	Until now the balance was Net Amount minus Paid Amount, so an amount typed into a purchase that
	was still Pending made it look settled. From now on Paid Amount of a Pending purchase is only the
	prepared figure (equal to Net Amount) and the balance is the whole Net Amount.

	Only Pending purchases are corrected. Paid and Cancelled purchases are left exactly as they are,
	including old ones marked Paid with no Paid Amount.
	"""
	frappe.db.sql(
		"""
		update `tabGrain Purchase`
		set paid_amount = net_amount, balance_amount = net_amount
		where payment_status = 'Pending'
			and (ifnull(paid_amount, 0) != ifnull(net_amount, 0) or ifnull(balance_amount, 0) != ifnull(net_amount, 0))
		"""
	)

	# Where permissions for Grain Purchase were customised on the site, the standard permission row for
	# the new role is ignored, so add it to the customised set as well.
	if frappe.db.exists("Custom DocPerm", {"parent": "Grain Purchase"}) and not frappe.db.exists(
		"Custom DocPerm", {"parent": "Grain Purchase", "role": PAYMENT_ROLE}
	):
		frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": "Grain Purchase",
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": PAYMENT_ROLE,
				"read": 1,
				"report": 1,
				"print": 1,
				"export": 1,
				"email": 1,
			}
		).insert(ignore_permissions=True)
