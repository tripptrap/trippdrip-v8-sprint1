# Question for Telnyx support — copy and send

Two things must be settled before touching the toll-free verification. Paste the message below
into a Telnyx support ticket.

---

Hi,

We have a Verified toll-free verification on our account
(`6723e639-83ee-5c48-9ec7-b550fdce868c`, HyveWyre LLC) and need to update it. Two questions
before we change anything.

**1. Are our numbers still covered after being released and re-acquired?**

The verification was approved on 2026-01-16 covering five numbers. Our account was later
suspended for non-payment and those numbers were released. On 2026-07-26 we re-acquired three of
them, and they are the numbers on the account today:

- +18887062631
- +18886638510
- +18884610148

Are these still covered by the existing verification, or does leaving and returning to the
account end that coverage? We would rather ask than assume we are verified and send on a number
that is not.

**2. Amend the existing request, or submit a new one?**

Our platform has changed and parts of the approved text no longer describe it accurately. We want
to correct:

- **Use case** from `Conversational / Alerts` to `Mixed`. Our customers send marketing alongside
  reminders and follow-ups, and our consent language already discloses that.
- **The one-number-per-business statement.** The approved text says no single business uses more
  than one number. We now allow a business to hold more than one for geographic coverage, so a
  consumer is contacted from a number local to them.
- **A claim about consent enforcement.** The approved text says we enforce consent requirements at
  the platform level before a customer can send. That overstates what we do, and we want it
  replaced with an accurate description: our customers obtain consent from their own contacts, and
  we enforce suppression, opt-out handling, content screening and volume limits on every message.

Can a Verified request be edited in place, or does a change like this require a new submission?

**And if it requires a new submission:** do the three numbers above keep sending under the
existing verification while the replacement is reviewed, or is there a gap? This is the part that
matters most to us — we cannot have messaging stop unexpectedly.

**3. Scaling numbers**

Separately, we expect to onboard 100–1,000 small businesses over the next 12 months, each using
one toll-free number. We understand the 5-numbers-per-business guidance and that we would be
requesting well beyond it as an ISV, with each number assigned to one independent end-business.
What is the right way to request that volume — batched submissions, or something else?

Thanks,
Carson Rios / Tripp Browning
HyveWyre LLC — support@hyvewyre.com

---

## Why each question is there

**1** — the numbers left the account and came back. Whether verification survives that is not
documented anywhere we can find, and assuming wrongly means sending on an unverified number.

**2** — nothing in the API response or Telnyx's docs says whether a Verified record is editable.
Guessing wrong and having the verification pulled while a replacement is reviewed would stop all
sending.

**3** — 100–1,000 numbers against a stated cap of 5 per business is the actual difficulty of this
filing. Rejection `65ad888e` was exactly this: *"Justification for more than 5 numbers per
business."* Better to ask the process up front than to be rejected on it twice.
