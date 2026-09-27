# Sokoni Hub — billing, documents, email and scheduling

Everything from the four open items, plus the earlier currency fix.

**Two ways to apply.** Use the patch if your repo is on `main` (verified: it applies
cleanly to a fresh clone). Otherwise copy the files — the folder structure mirrors the
repo, so `api/src/...` and `web/src/...` drop straight in.

```bash
git apply billing-and-currency.patch
```

---

## What is in here

### New files

| File | Purpose |
|---|---|
| `db/migrations/003_currency_billing.sql` | QAR defaults, settlement tables, receipt numbering |
| `db/migrations/004_payouts_email.sql` | vendor bank details, email log, payout batches |
| `api/src/billing.ts` | settlement maths, pure and testable |
| `api/src/templates.ts` | printable receipt + statement HTML |
| `api/src/routes/billing.ts` | all billing endpoints, incl. cron and payouts |
| `api/src/mailer.ts` | email via Resend or Brevo — **no new npm dependency** |
| `web/src/pages/admin/AdminBilling.tsx` | admin Billing page |
| `web/src/pages/vendor/VendorStatements.tsx` | vendor Statements tab |

### Changed files

`api/src/config.ts`, `api/src/delivery.ts`, `api/src/server.ts`,
`api/src/routes/{orders,listings,vendors}.ts`, `web/src/App.tsx`,
`web/src/pages/Static.tsx`, `web/src/pages/admin/AdminLayout.tsx`,
`web/src/pages/vendor/VendorLayout.tsx`.

---

## 1. UI — done

**Admin → Billing** (`/admin/billing`), three tabs:

- **Statements** — filter by status; per row: View, Issue, Email, Mark paid, Void.
  Balance is colour-coded and labelled "vendor owes you" or "you owe vendor" so the
  direction is never ambiguous.
- **Payouts** — totals both ways, bank-transfer CSV export, multi-select several
  statements and settle them under one reference. Warns about vendors with no IBAN.
- **Settings** — commission rate, and the business details printed on every document.

"Generate statements" opens a month picker with a **Preview** step, so you see the
figures before anything is written.

**Vendor → Statements** (`/vendor/statements`) — their own statements, what they owe or
are owed, a View/print button, and a payout bank-details form. Drafts are hidden from
vendors; they only see a statement once you issue it.

**Buyer** — a **Download receipt** button on the order tracking page, next to
"Problem with this order?". Works for guests, since it authenticates on order code +
phone exactly as tracking does.

One implementation note: documents sit behind an `Authorization` header, so a plain
`<a href>` cannot fetch them. The admin and vendor pages fetch with the token and open
the result as a blob URL. The buyer receipt is public, so it is a normal link.

## 2. Scheduled run — done

```
POST /api/billing/cron/run-statements
     header: x-cron-secret: <CRON_SECRET>
     body (optional): {"month":"2026-09","issue":true,"email":true}
```

With no body it settles **the month just ended**, so running it on the 1st does the
right thing. It generates, issues and emails in one pass.

Set `CRON_SECRET` in your environment, then point your existing cron service at it:

```
0 2 1 * *   POST https://sokoni-hub.onrender.com/api/billing/cron/run-statements
            header  x-cron-secret: <your secret>
```

Safe to run repeatedly — a month already settled reports `generated: 0`.

## 3. Email — done, and dependency-free

`api/src/mailer.ts` talks to **Resend** or **Brevo** over HTTPS using the built-in
`fetch`. No nodemailer, no SMTP, nothing added to `package.json`.

```
EMAIL_PROVIDER=resend        # or brevo, or none (default)
EMAIL_API_KEY=...
EMAIL_FROM=billing@yourdomain.com
EMAIL_FROM_NAME=Sokoni Hub
EMAIL_REPLY_TO=support@yourdomain.com
```

**Default is `none`** — with nothing configured the app behaves exactly as before and
sends are recorded as `skipped`, never throwing.

What sends:
- **Vendor statement** — the Email button, or automatically by the cron run.
- **Buyer receipt** — automatically when a vendor marks an order `delivered`, if the
  buyer has an account with an email. Guest checkouts are skipped silently.

Every attempt is written to `email_log` (sent / failed / skipped, with the provider's
id or the error), readable at `GET /api/billing/email-log`. A mail failure never rolls
back the action that triggered it — an order is still delivered if the receipt bounces.

## 4. Payouts — as automated as is possible without a payment rail

Being straight with you: **money cannot move automatically.** There is no gateway
connected, so no code here can push funds. Saying otherwise would be a lie.

Everything *around* the transfer is now automated:

- Vendors store bank name, account name and IBAN themselves
- `GET /api/billing/payouts/outstanding` — who is owed what, both directions
- `GET /api/billing/payouts/export.csv` — bank-ready bulk-transfer file
- `POST /api/billing/payouts/batch` — settle many statements under one reference,
  recorded as a `payout_batches` row so one bank transfer covering six vendors is
  still traceable to each statement

You make the transfer; the system does the arithmetic, the documents and the record.
When you add SkipCash or Dibsy, set `orders.funds_collected_by = 'platform'` at
checkout and the ledger reverses direction on its own — no settlement logic changes.

---

## Deploy

```bash
git apply billing-and-currency.patch
cd api && npm run build
psql "$DATABASE_URL" -f db/migrations/003_currency_billing.sql
psql "$DATABASE_URL" -f db/migrations/004_payouts_email.sql
cd ../web && npm run build
```

Both migrations are idempotent and safe to re-run. New environment variables:
`CRON_SECRET`, and the `EMAIL_*` set if you want email. Everything works without them.

---

## How this was verified

A real Postgres 18 (PGlite over the wire protocol) with your actual `schema.sql` and
migrations 002–004, the **real Express API** connected to it, driven over HTTP.

**Live API, 17/17:** generate creates a draft · re-run cannot double-bill · vendor
cannot see drafts · issued as `INV-2026-0001` · vendor then sees it · document renders
correct figures · settings appear on the document · vendor can open their own ·
unauthenticated rejected · email reports failure with no provider (502) · skip recorded
in `email_log` · outstanding shows QAR 20 to collect · CSV exports · batch settles ·
status becomes paid · paid cannot be voided.

**Receipts and cron, 8/8:** receipt renders with a number · total matches (QAR 225) ·
names the vendor · number stable across requests · wrong phone gets 404 · cron rejects
bad and missing secrets · cron skips an already-settled month. Plus a fresh month:
`generated: 1, issued: 1`, and an immediate re-run `generated: 0`.

**Schema, 28/28** across migrations 003 and 004, including idempotency, the
double-billing constraint and the two-directional-balance CHECK.

**Maths, 17/17** — all-cash, all-online, mixed, zero-rate, and a rounding case proving
per-line commissions re-add exactly to the header total.

End-to-end currency proof: a listing created through the API came back `QAR`, an order
placed through checkout came back `QAR` with total 225, and commission computed to 20
— 10% of the 200 in goods, with the 25 delivery fee correctly excluded.

`tsc --noEmit` clean on both `api` and `web`; `vite build` succeeds.

**Not verified:** nothing has run against your live Supabase or Render, and no email
has actually been delivered — no provider key exists here, so only the `skipped` path
was exercised. Send one real test email after you set `EMAIL_API_KEY`.
