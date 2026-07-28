# 10DLC submissions

Everything about what we've submitted, why each attempt was rejected, and how to
submit the next one.

## Files

| Path | What it is |
|---|---|
| `docs/10dlc-campaign-payload.json` | **The editable payload.** This is what gets submitted next. Edit this, not code. |
| `docs/10dlc-submissions/NN-date-id.json` | One archived attempt: full payload as submitted, outcome, verbatim failure reasons. |
| `docs/10dlc-submissions/index.json` | Attempt list with outcomes. |
| `docs/10DLC_REJECTION_HISTORY.md` | The narrative — every rejection verbatim, the fix, and the pre-submission checklist. |
| `scripts/submit-10dlc-campaign.js` | Submits `10dlc-campaign-payload.json`. `--dry-run` prints without submitting. |
| `scripts/archive-10dlc-submissions.js` | Re-snapshots every attempt from Telnyx. `--diff` shows what changed between attempts. |

## Workflow

```bash
# 1. see what we'd send, and whether it still matches the live opt-in form
node scripts/submit-10dlc-campaign.js --dry-run

# 2. edit docs/10dlc-campaign-payload.json as needed

# 3. submit
node scripts/submit-10dlc-campaign.js

# 4. archive the attempt (pass the new id — the brand listing lags a few minutes)
node scripts/archive-10dlc-submissions.js <newCampaignId>

# 5. later, check the outcome and compare attempts
node scripts/archive-10dlc-submissions.js --diff
```

Then add the verbatim rejection reason to `10DLC_REJECTION_HISTORY.md`.

## Two things that will bite you

**1. `status` is not the review result.** `GET /10dlc/campaign/{id}` returns
`status: "ACTIVE"` for campaigns the portal shows as **"Failed Telnyx Review"** —
it reflects the TCR record's lifecycle, not the outcome. **Read `failureReasons`.**
This was misread once and reported as a pass when it wasn't.

**2. `messageFlow` quotes the consent text verbatim, and Telnyx checks it against
the live page.** Attempt 6 was rejected for exactly this drift. The submit script
now refuses to run if `messageFlow`'s quoted consent doesn't appear on
https://hyvewyre.com/opt-in/hyvewyre-llc.

If you change the consent wording, the order matters:

1. edit `lib/optInConsent.ts` (it feeds the live checkbox, the stored
   `consent_text` audit record, and this quote)
2. deploy, and confirm the new text is actually live
3. mirror it into `10dlc-campaign-payload.json`
4. submit

## Other notes

- **Campaigns are create-only.** There's no update endpoint (`OPTIONS` returns
  `GET` alone), so every fix means a new campaign. The old rejected ones just sit
  there.
- **The list endpoint needs `brandId`** — `/10dlc/campaign?brandId=…&page=1&recordsPerPage=100`.
  Without it you get `10004 Missing required parameter`; `/10dlc/campaigns` is a 404.
- **A failed Telnyx review isn't billed** (per the account owner, 2026-07-28) —
  only a campaign that actually reaches the carriers. Iterating on rejections is
  cheap.
- **A fresh submission has no TCR id yet**, which looks identical to a genuine
  TCR-creation failure. The difference is `failureReasons`; the archive labels the
  former `AWAITING_REVIEW`.
