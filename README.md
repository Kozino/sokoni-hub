# VIP & Featured — paid placement

11 files, 1310 insertions. Built against and verified on `main @ 185cc8b`.

```bash
git apply promotions.patch
psql "$DATABASE_URL" -f db/migrations/008_promotions.sql
```

The migration is idempotent. It adds three settings columns with sensible
defaults (4 VIP slots, 8 Featured, 15-minute rotation) so the feature is inert
until you sell something.

---

## How it works

A vendor pays for a **time-bounded placement** in one of two tiers. Admin sells
it, can revoke it early, and it stops on its own when the paid period ends.

| | |
|---|---|
| **VIP** | Larger card, gold treatment, shown first. Default 4 slots. |
| **Featured** | Standard card. Default 8 slots. |

Both appear on the landing page above the category wall and the organic rails —
the vendor is paying for visibility, and three scrolls down is not that.

---

## Five decisions that make this more than a boolean on `vendors`

### 1. Expiry is evaluated when the row is read, never by a job

This is the single most important choice here, and it is driven by something
already true of your codebase: **the billing cron has never run in production**,
because `CRON_SECRET` is unset. If "is this placement live" were a stored flag
flipped on a schedule, every expired vendor would keep their paid slot forever
and nobody would notice. The failure is silent, and it is revenue you are giving
away.

So `active_promotions` derives liveness from `now()` on every read. A placement
cannot outlive the money, with no scheduled task anywhere in the design.

Tested at the boundary: live one second before `ends_at`, gone one second after.

### 2. Slots are finite, and oversubscription rotates fairly

Unlimited "featured" is worth nothing to the vendor and cannot honestly be sold
twice. The slot count is a setting. When more vendors have paid than there are
slots, ordering by anything stable — `created_at`, name, rating — means the same
vendors win *every single render* and the rest paid for nothing.

Placement is therefore ordered by a hash of `(vendor id + current time bucket)`:

- **within** a bucket the order is identical, so the page does not flicker on
  refresh and the response stays cacheable;
- **across** buckets it permutes, so impressions spread across everyone.

Measured, not asserted — 12 vendors competing for 4 slots over 600 buckets:

```
appearances: min 187, max 211, expected ~200
```

### 3. Paid placement is always labelled

Presenting paid position as organic ranking is a consumer-protection problem,
not a design preference. The API returns `tier` with every promoted store
specifically so the UI cannot render one without a badge, and there is a plain
disclosure line under the section:

> Stores in this section pay for placement. It does not affect their rating,
> their reviews, or where they appear in search results.

A browser test asserts rect-intersection on every card: **5 cards, 5 badges,
0 unlabelled**, at every viewport.

### 4. Eligibility is stricter than "they paid"

Enforced in the view, so it cannot be bypassed from the UI:

- **the vendor must still be verified** — a suspended store vanishes from the
  landing page immediately, whatever they paid;
- **the store must have active listings** — a featured empty store burns a paid
  slot and reads as a broken link.

Admin still sees those placements, flagged `suspended`, rather than having them
silently disappear.

### 5. It is a ledger, not a state flag

Revoking sets `revoked_at` and a **mandatory reason**; it does not delete. That
is what a refund conversation two months later points at. Renewals, history and
"what did placement earn last quarter" all need the rows kept.

---

## API

| Method | Path | Who |
|---|---|---|
| GET | `/promotions` | public — the landing carousel, both tiers, one query |
| POST | `/promotions/track` | public — batched impression/click counters |
| GET | `/promotions/mine` | vendor — their placements and what they bought |
| GET | `/promotions/admin` | admin — everything, with derived state |
| GET | `/promotions/admin/availability` | admin — is this tier full for these dates |
| POST | `/promotions/admin` | admin — sell |
| PATCH | `/promotions/admin/:id` | admin — extend, reprice, record payment |
| POST | `/promotions/admin/:id/revoke` | admin — stop early, reason required |
| GET | `/promotions/admin/revenue` | admin — billed vs collected by month |

Admin endpoints refuse vendors and buyers with 403 — including a vendor trying
to grant themselves placement.

### Guard rails in the sell flow

- Only **verified** stores; a pending store is refused *with the reason*.
- One vendor cannot hold **two overlapping placements in the same tier** (almost
  always a double-entry, and it would let them occupy two slots). The other tier
  is independent.
- **Availability is checked while the dates are typed**, not after the sale. If
  the tier is full the admin sees what they are actually selling before quoting:

  > **Featured is full for those dates.** 4 placements for 3 slots. You can still
  > sell this one, but positions rotate — each store would be visible roughly
  > **75%** of the time. Price it accordingly, or raise the slot count.

- Extending a **lapsed** placement runs from today, not from the old end date,
  so you cannot accidentally grant days that are already in the past.

---

## Verification — 75 assertions

| Suite | Result | Covers |
|---|---|---|
| `t_008.js` | **31/31** | window boundary, eligibility, derived states, constraints, cascade, rotation fairness and stability, tier independence |
| `t_promotions.sh` | **44/44** | authorisation, sell/extend/revoke/repay, double-booking, availability maths, tracking, revenue, revoked rows kept |

Plus `tsc --noEmit` clean on `api` and `web`, `vite build` clean, and the
rendered page measured in real Chrome at 1280 / 768 / 390:

```
promo-desktop-1280  cards=5 vip=2 badges=5 unlabelled=0 disclosure=true overflow=none
promo-tablet-768    cards=5 vip=2 badges=5 unlabelled=0 disclosure=true
promo-mobile-390    cards=5 vip=2 badges=5 unlabelled=0 disclosure=true overflow=none
admin-promos-1280   rows=6 cols=6 overflow=none
admin-promos-390    rows=6 cols=2 overflow=none
```

### Two defects the browser caught that the tests did not

- **The badge overlapped the store name** on Featured cards. It was absolutely
  positioned and the card's `padding-top` was meant to dodge it; they disagreed
  by ~4px. Fixed by giving the badge its own row rather than tuning a magic
  number. There is now an automated rect-intersection check so it cannot regress.
- **Revoke was clipped** off the right edge of the admin table — three buttons
  did not fit the action column. "Mark paid" moved onto the payment label, where
  it reads better anyway.

### Known, pre-existing, not from this feature

The landing page has a **23px horizontal overflow at ~768px** (tablet). It is
present with this section hidden, so it is not introduced here — I isolated that
much but did not chase the cause further, since it is outside what you asked
for. Clean at 390 and 1280. Happy to fix it separately.

### Not verified

Nothing has run against live Supabase or Render. The `select ... for update`-free
design means there is no concurrency hazard here, but note PGlite serves one
client, so the carousel's behaviour under parallel load is untested (it is a
single read query, so the risk is low).

---

## What I deliberately did not do

**Placement fees do not flow into `vendor_statements`.** Statements are periodic
commission on sales; folding an unrelated one-off charge into them would make
both harder to read and to dispute. The price, payment reference and paid date
live on the placement, and `/promotions/admin/revenue` reports billed vs
collected. Say the word if you would rather it appeared as a statement line.

**Impression counts are not billing-grade.** The tracking endpoint is
unauthenticated by necessity — buyers are not logged in — so the numbers are
inflatable by anyone with curl. They are a relative signal for the vendor's
report, never an input to what you charge. If you ever want to sell on a CPM
basis, that needs server-side counting with bot filtering.

**No self-service purchase.** Admin grants placement after payment, exactly as
you described. The vendor-facing endpoint is read-only.
