"""Rehearsal of the Grain Purchase payment rules. It tries to get a purchase marked as paid, or its
outstanding reduced, by every route other than the Confirm Payment button, and checks each is refused.

    bench --site <site> execute trustbit_mandi.rehearsals.payment.run

Everything happens in ONE database transaction that is rolled back at the end, so nothing is left
behind: no purchase, no user, no comment. Safe on a live site at a quiet moment.
"""

import frappe
from frappe.utils import add_days, flt, nowdate

from trustbit_mandi.trustbit_mandi.doctype.grain_purchase import grain_purchase as gp

ACCOUNTS = "zz-mandi-accounts@example.com"   # holds the Mandi Accounts role only
STOREMAN = "zz-mandi-store@example.com"      # Stock Manager: may create and edit purchases
ADMIN = "Administrator"


class Rehearsal:
	def __init__(self):
		self.rows = []
		self.failed = 0

	def check(self, label, ok, detail=""):
		self.rows.append(("PASS" if ok else "FAIL", label, detail))
		if not ok:
			self.failed += 1

	def refused(self, label, fn, must_contain=None, as_user=None):
		"""`fn` must be refused. A savepoint keeps the refusal from undoing the work done so far."""
		previous = frappe.session.user
		frappe.db.savepoint("refusal")
		try:
			if as_user:
				frappe.set_user(as_user)
			fn()
			self.check(label, False, "was ACCEPTED")
		except Exception as e:
			text = frappe.utils.strip_html(str(e)).replace("\n", " ")
			expected = isinstance(e, (frappe.ValidationError, frappe.PermissionError))
			self.check(label, expected and (not must_contain or must_contain.lower() in text.lower()), text[:150])
		finally:
			frappe.db.rollback(save_point="refusal")
			frappe.local.message_log = []
			frappe.set_user(previous)


def _user(email, roles):
	frappe.get_doc(
		{"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0,
		 "roles": [{"role": r} for r in roles]}
	).insert(ignore_permissions=True)


def _purchase(**kw):
	values = {"doctype": "Grain Purchase", "farmer_name": "ZZ Rehearsal Farmer", "contract_date": nowdate(),
		"kg_of_bag": 60, "actual_bag": 100, "auction_rate": 2500, "hamali_rate_include": 1}
	values.update(kw)
	return frappe.get_doc(values).insert()


def _state(name):
	return frappe.db.get_value("Grain Purchase", name, ["payment_status", "net_amount", "paid_amount", "balance_amount"], as_dict=True)


def _is(name, status, paid, outstanding):
	s = _state(name)
	return s.payment_status == status and flt(s.paid_amount) == flt(paid) and flt(s.balance_amount) == flt(outstanding)


def _show(name):
	s = _state(name)
	return f"{s.payment_status}, net {flt(s.net_amount):,.0f}, paid amount {flt(s.paid_amount):,.0f}, outstanding {flt(s.balance_amount):,.0f}"


def run():
	t = Rehearsal()
	real_enqueue, frappe.enqueue = frappe.enqueue, (lambda *a, **k: None)
	frappe.flags.mute_emails = True
	frappe.set_user(ADMIN)
	try:
		_user(ACCOUNTS, [gp.PAYMENT_ROLE])
		_user(STOREMAN, ["Stock Manager"])

		# ---- 1. a Pending purchase: the amount is prepared, nothing is settled
		frappe.set_user(STOREMAN)
		doc = _purchase()
		name, net = doc.name, flt(doc.net_amount)
		t.check("1  new purchase: Pending, Paid Amount filled from Net Amount, whole amount outstanding", net > 0 and _is(name, "Pending", net, net), _show(name))
		for _ in range(3):
			frappe.get_doc("Grain Purchase", name).save()
		t.check("2  saved three more times: nothing changes", _is(name, "Pending", net, net), _show(name))
		d = frappe.get_doc("Grain Purchase", name); d.actual_bag = 120; d.save(); net = flt(d.net_amount)
		t.check("3  quantity changed before payment: Paid Amount and outstanding follow the new Net Amount", _is(name, "Pending", net, net) and net == 180000, _show(name))

		# ---- 2. every way of marking it paid without the button
		def set_paid_on_save():
			d = frappe.get_doc("Grain Purchase", name); d.payment_status = "Paid"; d.save()
		t.refused("4  status changed to Paid and saved", set_paid_on_save, "Confirm Payment")
		t.refused("5  a new purchase inserted already Paid", lambda: _purchase(payment_status="Paid"), "Confirm Payment")
		def set_partial():
			d = frappe.get_doc("Grain Purchase", name); d.payment_status = "Partial"; d.save()
		t.refused("6  status changed to Partial (removed)", set_partial)
		t.refused("7  status set to Paid through the general set-value call", lambda: frappe.client.set_value("Grain Purchase", name, "payment_status", "Paid"), "Confirm Payment")
		def type_amount():
			d = frappe.get_doc("Grain Purchase", name); d.paid_amount = 1; d.save()
			if not _is(name, "Pending", net, net):
				frappe.throw("typed amount was kept")
		type_amount()
		t.check("8  an amount typed into Paid Amount is ignored: still Pending, whole amount outstanding", _is(name, "Pending", net, net), _show(name))
		t.check("9  Paid Amount cannot be typed on the form (read-only)", bool(frappe.get_meta("Grain Purchase").get_field("paid_amount").read_only), "")

		# ---- 3. the button itself
		today = nowdate()
		t.refused("10 confirm by a user without the role (Stock Manager)", lambda: gp.confirm_payment(name, today, "Cash"), "Mandi Accounts", as_user=STOREMAN)
		frappe.set_user(ACCOUNTS)
		t.refused("11 confirm without a payment mode", lambda: gp.confirm_payment(name, today, ""), "Pay Date and Payment Mode")
		t.refused("12 confirm without a pay date", lambda: gp.confirm_payment(name, None, "Cash"), "Pay Date and Payment Mode")
		t.refused("13 confirm with a payment mode that is not on the list", lambda: gp.confirm_payment(name, today, "Barter"), "must be one of")
		t.refused("14 confirm for one rupee less than the Net Amount", lambda: gp.confirm_payment(name, today, "Cash", amount=net - 1), "full Net Amount")
		t.refused("15 confirm for one rupee more than the Net Amount", lambda: gp.confirm_payment(name, today, "Cash", amount=net + 1), "full Net Amount")
		gp.confirm_payment(name, today, "NEFT", payment_details="UTR ZZ123", amount=net)
		comments = frappe.get_all("Comment", filters={"reference_doctype": "Grain Purchase", "reference_name": name, "comment_type": "Info"}, pluck="content")
		t.check("16 confirm by Mandi Accounts with date, mode and the full amount: Paid, nothing outstanding", _is(name, "Paid", net, 0), _show(name))
		t.check("17 the confirmation is written on the purchase's timeline", any("Payment confirmed" in c for c in comments), "; ".join(frappe.utils.strip_html(c) for c in comments)[:120])
		t.refused("18 confirm a second time", lambda: gp.confirm_payment(name, today, "NEFT"), "already confirmed")
		t.check("19 after the second attempt: still Paid once, amounts unchanged", _is(name, "Paid", net, 0), _show(name))

		# ---- 4. a paid purchase is frozen
		def edit(field, value, user):
			def go():
				d = frappe.get_doc("Grain Purchase", name); d.set(field, value); d.save()
			return go
		t.refused("20 a paid purchase edited by a Stock Manager", edit("phone_number", "9000000000", STOREMAN), "Only Admin", as_user=STOREMAN)
		frappe.set_user(ADMIN)
		edit("phone_number", "9000000001", ADMIN)()
		t.check("21 a paid purchase's phone number corrected by an administrator: saved, amounts unchanged", _is(name, "Paid", net, 0) and frappe.db.get_value("Grain Purchase", name, "phone_number") == "9000000001", _show(name))
		t.refused("22 a paid purchase's bags changed by an administrator", edit("actual_bag", 130, ADMIN), "cannot change")
		t.refused("23 a paid purchase set back to Pending by hand", edit("payment_status", "Pending", ADMIN), "Reverse Payment")
		t.refused("24 a paid purchase set to Cancelled by hand", edit("payment_status", "Cancelled", ADMIN), "Reverse Payment")

		# ---- 5. reversal
		t.refused("25 reverse by Mandi Accounts", lambda: gp.reverse_payment(name, "typed wrong"), "administrator", as_user=ACCOUNTS)
		t.refused("26 reverse without a reason", lambda: gp.reverse_payment(name, "  "), "reason")
		gp.reverse_payment(name, "Paid to the wrong account")
		t.check("27 reverse by an administrator with a reason: Pending again, whole amount outstanding", _is(name, "Pending", net, net), _show(name))
		t.refused("28 reverse a purchase that is not Paid", lambda: gp.reverse_payment(name, "again"), "not Paid")
		edit("actual_bag", 130, ADMIN)(); net2 = flt(_state(name).net_amount)
		frappe.set_user(ACCOUNTS); gp.confirm_payment(name, add_days(today, 1), "RTGS", amount=net2); frappe.set_user(ADMIN)
		t.check("29 corrected after the reversal and confirmed again: Paid at the new Net Amount", net2 == 195000 and _is(name, "Paid", net2, 0), _show(name))

		# ---- 6. cancelled purchases
		frappe.set_user(STOREMAN)
		c = _purchase(); cn, cnet = c.name, flt(c.net_amount)
		d = frappe.get_doc("Grain Purchase", cn); d.payment_status = "Cancelled"; d.save()
		t.check("30 a Pending purchase cancelled: nothing paid, nothing outstanding", _is(cn, "Cancelled", 0, 0), _show(cn))
		t.refused("31 confirm payment of a cancelled purchase", lambda: gp.confirm_payment(cn, today, "Cash"), "Only a Pending purchase", as_user=ACCOUNTS)
		d = frappe.get_doc("Grain Purchase", cn); d.payment_status = "Pending"; d.save()
		t.check("32 the cancelled purchase reopened: Pending, whole amount outstanding", _is(cn, "Pending", cnet, cnet), _show(cn))

		# ---- 7. records from before this rule
		frappe.set_user(ADMIN)
		old_paid = _purchase(farmer_name="ZZ Old Paid").name; onet = flt(_state(old_paid).net_amount)
		frappe.db.sql("update `tabGrain Purchase` set payment_status='Paid', paid_amount=0, balance_amount=net_amount where name=%s", old_paid)
		old_pending = _purchase(farmer_name="ZZ Old Pending").name; pnet = flt(_state(old_pending).net_amount)
		frappe.db.sql("update `tabGrain Purchase` set payment_status='Pending', paid_amount=net_amount, balance_amount=0 where name=%s", old_pending)
		d = frappe.get_doc("Grain Purchase", old_paid); d.address = "corrected"; d.save()
		t.check("33 an old purchase marked Paid with no Paid Amount, re-saved by an administrator: left exactly as it was", _is(old_paid, "Paid", 0, onet), _show(old_paid))
		from trustbit_mandi.patches.v1_5 import pending_purchases_owe_net_amount as correction
		correction.execute()
		t.check("34 one-time correction: an old Pending purchase with the amount typed in owes its whole Net Amount again", _is(old_pending, "Pending", pnet, pnet), _show(old_pending))
		t.check("35 one-time correction leaves the old Paid purchase alone", _is(old_paid, "Paid", 0, onet), _show(old_paid))
		t.check("36 one-time correction leaves a purchase paid the new way alone", _is(name, "Paid", net2, 0), _show(name))
		correction.execute()
		t.check("37 the correction run a second time changes nothing", _is(old_pending, "Pending", pnet, pnet) and _is(old_paid, "Paid", 0, onet), "")

		# ---- 8. what is printed
		try:
			pending_print = frappe.utils.strip_html(frappe.get_print("Grain Purchase", cn, "Grain Purchase Receipt"))
			paid_print = frappe.utils.strip_html(frappe.get_print("Grain Purchase", name, "Grain Purchase Receipt"))
			t.check("38 receipt of a Pending purchase does not show it as paid", "FULLY PAID" not in pending_print and "Balance Due" not in pending_print, "")
			t.check("39 receipt of a paid purchase says FULLY PAID", "FULLY PAID" in paid_print, "")
		except Exception as e:
			t.check("38 receipt print format renders", False, str(e)[:150])

		options = frappe.get_meta("Grain Purchase").get_field("payment_status").options.split("\n")
		t.check("40 Payment Status choices are Pending, Paid, Cancelled", options == ["Pending", "Paid", "Cancelled"], ", ".join(options))
		t.check("41 the Mandi Accounts role exists and can read purchases but not write them",
			bool(frappe.db.exists("Role", gp.PAYMENT_ROLE)) and frappe.has_permission("Grain Purchase", "read", user=ACCOUNTS) and not frappe.has_permission("Grain Purchase", "write", user=ACCOUNTS), "")
	except Exception:
		t.check("rehearsal ran to the end", False, frappe.get_traceback()[-600:])
	finally:
		frappe.set_user(ADMIN)
		frappe.db.rollback()
		frappe.enqueue = real_enqueue
		for user in (ACCOUNTS, STOREMAN):
			frappe.clear_cache(user=user)
		left = frappe.db.exists("User", ACCOUNTS) or frappe.db.exists("Grain Purchase", {"farmer_name": ["like", "ZZ %"]})
		for mark, label, detail in t.rows:
			print(f"  {mark} | {label}" + (f"\n         -> {detail}" if detail else ""))
		print(f"\n{len(t.rows) - t.failed} of {len(t.rows)} passed. Left behind: {bool(left)}")
		if t.failed:
			raise SystemExit(1)
