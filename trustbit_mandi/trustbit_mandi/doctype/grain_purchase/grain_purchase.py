# Copyright (c) 2026, Trustbit Software and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, fmt_money, formatdate, nowdate, now_datetime, getdate, get_datetime, rounded
import random

# Holders of this role (and System Managers) confirm that a purchase has been paid.
PAYMENT_ROLE = "Mandi Accounts"


def _round(value, precision=0):
	"""Round half up (0.49 -> 0, 0.50 -> 1), the same way the form's Math.round does.

	Python's built-in round() rounds an exact half to the nearest EVEN number, so the server saved
	34,708.50 as 34,708 after the screen had shown 34,709. Named explicitly here so the result does
	not depend on System Settings > Rounding Method."""
	return rounded(flt(value), precision, rounding_method="Commercial Rounding")


class GrainPurchase(Document):
	def before_insert(self):
		"""Set defaults for new documents"""
		self.generate_transaction_no()
		self.set_default_tax_rates()
		self.fetch_hamali_rate()

	def before_save(self):
		"""Calculate all values before saving"""
		saved = self.saved_payment()
		self.check_payment_status_change(saved)
		self.check_paid_modification(saved)
		if not self.is_frozen_as_paid(saved):
			# A paid purchase keeps the rates it was paid at; everything else follows the masters.
			self.fetch_tax_rates()
			self.fetch_hamali_rate()  # Refetch rate based on current kg_of_bag
		self.fetch_bank_details()
		self.calculate_values()
		self.set_payment_amounts(saved)

	# ---- payment -------------------------------------------------------------------------------
	# A purchase is Pending until someone confirms the payment (confirm_payment below). While it is
	# Pending, Paid Amount is only the prepared figure, always equal to Net Amount, and the whole Net
	# Amount is outstanding. Filling a field never settles anything. Paid means paid in full, once.

	def saved_payment(self):
		"""Payment status and amounts as they are in the database, or None for a new purchase."""
		if self.is_new():
			return None
		return frappe.db.get_value(
			"Grain Purchase", self.name, ["payment_status", "net_amount", "paid_amount", "balance_amount"], as_dict=True
		)

	def is_frozen_as_paid(self, saved):
		return bool(saved and saved.payment_status == "Paid" and not self.flags.reversing_payment)

	def check_payment_status_change(self, saved):
		"""Paid is reached only through Confirm Payment and left only through Reverse Payment."""
		self.payment_status = self.payment_status or "Pending"
		was = saved.payment_status if saved else None
		if self.payment_status == was:
			return
		if self.payment_status == "Paid" and not self.flags.confirming_payment:
			frappe.throw(
				_("A purchase becomes Paid only through the Confirm Payment button. Save it as Pending first."),
				title=_("Payment not confirmed"),
			)
		if was == "Paid" and not self.flags.reversing_payment:
			frappe.throw(
				_("This purchase is paid. Use Reverse Payment before changing its payment status."),
				title=_("Payment already confirmed"),
			)

	def check_paid_modification(self, saved):
		"""Prevent non-admin users from modifying paid entries"""
		if saved and saved.payment_status == "Paid" and not self.flags.reversing_payment:
			if "System Manager" not in frappe.get_roles(frappe.session.user):
				frappe.throw(
					"Payment is already done. Only Admin (System Manager) can modify paid entries.",
					frappe.PermissionError
				)

	def set_payment_amounts(self, saved):
		"""Paid Amount and the outstanding (Balance Amount) follow the payment status, never the other way."""
		if self.flags.confirming_payment:
			offered = self.flags.confirming_amount
			if offered is not None and flt(offered, 2) != flt(self.net_amount, 2):
				frappe.throw(
					_("The payment must be the full Net Amount, {0}. Part payments and overpayments are not accepted.").format(
						fmt_money(self.net_amount, currency="INR")
					),
					title=_("Not the full amount"),
				)
			self.paid_amount = flt(self.net_amount)
			self.balance_amount = 0
		elif self.is_frozen_as_paid(saved):
			# Already paid: the amounts stay exactly as recorded, whatever they are. Records marked Paid
			# before this rule existed, some with no Paid Amount at all, are deliberately left untouched.
			if flt(self.net_amount, 2) != flt(saved.net_amount, 2):
				frappe.throw(
					_("Net Amount of a paid purchase cannot change ({0} to {1}). Reverse the payment, correct the purchase, then confirm the payment again.").format(
						fmt_money(saved.net_amount, currency="INR"), fmt_money(self.net_amount, currency="INR")
					),
					title=_("Purchase is paid"),
				)
			self.paid_amount = saved.paid_amount
			self.balance_amount = saved.balance_amount
		elif self.payment_status == "Cancelled":
			self.paid_amount = 0
			self.balance_amount = 0
		else:
			self.paid_amount = flt(self.net_amount)
			self.balance_amount = flt(self.net_amount)

	def generate_transaction_no(self):
		"""Auto-generate transaction number"""
		if not self.transaction_no:
			today = nowdate()
			random_num = random.randint(10000, 99999)
			self.transaction_no = f"TXN-{today}-{random_num}"

	def set_default_tax_rates(self):
		"""Fill empty tax types with the Mandi Tax Type marked Default for each category"""
		defaults = get_default_tax_types()
		if not self.mandi_tax_type:
			self.mandi_tax_type = defaults.get("mandi_tax_type")
		if not self.nirashrit_tax_type:
			self.nirashrit_tax_type = defaults.get("nirashrit_tax_type")
		self.fetch_tax_rates()

	def fetch_tax_rates(self):
		"""Fetch tax rates from Mandi Tax Type master"""
		if self.mandi_tax_type:
			rate = frappe.db.get_value("Mandi Tax Type", self.mandi_tax_type, "rate")
			if rate is not None:
				self.mandi_tax_rate = flt(rate)

		if self.nirashrit_tax_type:
			rate = frappe.db.get_value("Mandi Tax Type", self.nirashrit_tax_type, "rate")
			if rate is not None:
				self.nirashrit_tax_rate = flt(rate)

	def fetch_hamali_rate(self):
		"""Fetch hamali rate from Hamali Rate Master based on contract date and bag weight"""
		if not self.contract_date:
			self.contract_date = nowdate()

		try:
			master = frappe.get_doc("Hamali Rate Master", "Mandi")
			if not master.is_active:
				self.hamali_rate = 7.50
				return

			kg_per_bag = flt(self.kg_of_bag, 2) or 60
			contract_date = getdate(self.contract_date)
			applicable_rate = None

			# Find applicable rate from history (latest entry for the contract date)
			if master.rate_history:
				best_match = None
				best_datetime = None

				for row in master.rate_history:
					row_date = getdate(row.effective_date)
					# Check if this rate was effective on or before contract date
					if row_date <= contract_date:
						# Use get_datetime for proper comparison
						row_datetime = get_datetime(row.effective_date)
						if best_datetime is None or row_datetime > best_datetime:
							best_datetime = row_datetime
							best_match = row

				if best_match:
					applicable_rate = best_match

			# Use current rate if no history match
			if not applicable_rate:
				applicable_rate = master

			# Select rate based on bag weight (60 KG or 80 KG)
			if kg_per_bag <= 60:
				self.hamali_rate = flt(applicable_rate.upto_60_kg, 2)
			else:
				self.hamali_rate = flt(applicable_rate.more_than_60_kg, 2)

			# Default if still 0
			if not self.hamali_rate:
				self.hamali_rate = 7.50

		except frappe.DoesNotExistError:
			self.hamali_rate = 7.50

	def fetch_bank_details(self):
		"""Auto-fill bank details from Mandi Bank Master"""
		if self.bank_account:
			try:
				bank = frappe.get_doc("Mandi Bank Master", self.bank_account)
				self.bank_name = bank.bank_name
				self.account_number = bank.account_number
				self.branch = bank.branch
				self.ifsc_code = bank.ifsc_code
			except frappe.DoesNotExistError:
				pass

	def calculate_values(self):
		"""Calculate weight, amount, hamali, and taxes"""
		# Weight Calculation (in Quintal)
		kg_per_bag = flt(self.kg_of_bag, 2) or 60
		actual_bags = flt(self.actual_bag, 2)
		nos_kg = flt(self.nos_kg, 2)

		self.actual_weight = _round((actual_bags * (kg_per_bag / 100)) + (nos_kg / 100), 2)

		# Amount Calculation
		auction_rate = flt(self.auction_rate, 2)
		self.amount = _round(auction_rate * self.actual_weight, 2)

		# Rounded Off Amount
		self.rounded_amount = _round(self.amount)
		self.rounded_off = self.rounded_amount - self.amount

		# Hamali Calculation
		hamali_rate = flt(self.hamali_rate, 2)
		if self.hamali_rate_include:
			self.hamali = 0
			self.net_amount = _round(self.amount)
		else:
			total_bags_for_hamali = actual_bags + (nos_kg / 100)
			self.hamali = _round(total_bags_for_hamali * hamali_rate)
			self.net_amount = _round(self.amount - self.hamali)

		# Tax Calculations
		mandi_tax_rate = flt(self.mandi_tax_rate, 2)
		nirashrit_tax_rate = flt(self.nirashrit_tax_rate, 2)

		self.mandi_tax = _round((self.amount * mandi_tax_rate) / 100, 2)
		self.nirashrit_tax = _round((self.amount * nirashrit_tax_rate) / 100, 2)
		self.total_tax = _round(self.mandi_tax + self.nirashrit_tax, 2)

		# Paid Amount and Balance Amount are set from the payment status, in set_payment_amounts().


@frappe.whitelist()
def get_default_tax_types():
	"""Return the active Mandi Tax Type marked Default for each Tax Category"""
	return {
		"mandi_tax_type": frappe.db.get_value(
			"Mandi Tax Type", {"tax_category": "Mandi Tax", "is_default": 1, "is_active": 1}, "name"
		),
		"nirashrit_tax_type": frappe.db.get_value(
			"Mandi Tax Type", {"tax_category": "Nirashrit Tax", "is_default": 1, "is_active": 1}, "name"
		),
	}


def _may_confirm_payment():
	roles = frappe.get_roles(frappe.session.user)
	return PAYMENT_ROLE in roles or "System Manager" in roles


@frappe.whitelist()
def confirm_payment(name, pay_date=None, payment_mode=None, payment_details=None, amount=None):
	"""Record that a Pending purchase has been paid in full. The only way a purchase becomes Paid.

	Takes a lock on the purchase first, so two people confirming at the same moment cannot both succeed."""
	if not _may_confirm_payment():
		frappe.throw(_("Only {0} can confirm a payment.").format(PAYMENT_ROLE), frappe.PermissionError)

	doc = frappe.get_doc("Grain Purchase", name, for_update=True)
	if doc.payment_status == "Paid":
		frappe.throw(_("Payment for {0} is already confirmed. Nothing was changed.").format(name), title=_("Already paid"))
	if doc.payment_status != "Pending":
		frappe.throw(_("Only a Pending purchase can be paid; {0} is {1}.").format(name, doc.payment_status))
	if not pay_date or not payment_mode:
		frappe.throw(_("Pay Date and Payment Mode are needed to confirm a payment."), title=_("Missing details"))
	modes = [m for m in (doc.meta.get_field("payment_mode").options or "").split("\n") if m]
	if payment_mode not in modes:
		frappe.throw(_("Payment Mode must be one of: {0}.").format(", ".join(modes)))

	doc.pay_date = getdate(pay_date)
	doc.payment_mode = payment_mode
	if payment_details:
		doc.payment_details = payment_details
	doc.payment_status = "Paid"
	doc.flags.confirming_payment = True
	doc.flags.confirming_amount = amount if amount not in (None, "") else None
	doc.save(ignore_permissions=True)
	doc.add_comment(
		"Info",
		_("Payment confirmed: {0} by {1} on {2}.").format(
			fmt_money(doc.paid_amount, currency="INR"), payment_mode, formatdate(doc.pay_date)
		),
	)
	return {"payment_status": doc.payment_status, "paid_amount": doc.paid_amount, "balance_amount": doc.balance_amount}


@frappe.whitelist()
def reverse_payment(name, reason=None):
	"""Take a Paid purchase back to Pending. For an administrator, with a reason; the purchase can then be corrected."""
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw(_("Only an administrator (System Manager) can reverse a payment."), frappe.PermissionError)
	if not (reason or "").strip():
		frappe.throw(_("Give the reason for reversing the payment."), title=_("Reason needed"))

	doc = frappe.get_doc("Grain Purchase", name, for_update=True)
	if doc.payment_status != "Paid":
		frappe.throw(_("{0} is not Paid, so there is no payment to reverse.").format(name))
	was_paid = doc.paid_amount
	doc.payment_status = "Pending"
	doc.flags.reversing_payment = True
	doc.save(ignore_permissions=True)
	doc.add_comment(
		"Info", _("Payment of {0} reversed. Reason: {1}").format(fmt_money(was_paid, currency="INR"), reason.strip())
	)
	return {"payment_status": doc.payment_status, "paid_amount": doc.paid_amount, "balance_amount": doc.balance_amount}

