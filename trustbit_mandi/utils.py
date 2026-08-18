"""Shared helpers for the Trustbit Mandi app."""

import frappe
from frappe import _


def get_mandi_company():
	"""Return the Company this app should post ERPNext documents against.

	This used to be the literal string "Trustbit Mandi" in three places
	(Sales Invoice creation, default-warehouse lookup, and the stock-integration
	patch), which made the app unusable on any site whose company was named
	anything else — the Sales Invoice insert died with
	"Could not find Company: Trustbit Mandi" and the warehouse lookup silently
	returned None.

	Resolution order, most explicit first:
	  1. Global Defaults -> Default Company (Settings > Global Defaults). This is
	     the configuration point; no app-specific settings doctype is needed.
	  2. The only Company on the site, when there is exactly one — the normal
	     case for a single-business install.
	  3. Otherwise throw, naming what to set rather than failing obscurely later.
	"""
	company = frappe.defaults.get_global_default("company")
	if company and frappe.db.exists("Company", company):
		return company

	companies = frappe.get_all("Company", pluck="name", limit=2)
	if len(companies) == 1:
		return companies[0]

	frappe.throw(
		_(
			"Trustbit Mandi does not know which Company to use.<br><br>"
			"Set <b>Default Company</b> in "
			"<a href='/app/global-defaults'>Settings &gt; Global Defaults</a>."
		),
		title=_("Mandi Company Not Configured"),
	)


def get_company_abbr(company=None):
	"""Abbreviation of the mandi company, used to build warehouse names."""
	return frappe.get_cached_value("Company", company or get_mandi_company(), "abbr")
