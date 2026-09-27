# Service bookings

Services stop going through the cart. They become **bookings**: the buyer states a
preferred time, the platform records it, and the conversation continues on WhatsApp
carrying the booking reference.

13 files, 1,055 insertions, 28 deletions. Verified against a clean clone of `main`
at `ceef14f`.

```bash
git apply service-bookings.patch
npm run migrate      # applies db/migrations/005_service_bookings.sql
```

---

## Why not checkout

The code was already telling us this. `orders.ts` forced service orders into
`pickup`, suppressed the delivery fee, and printed *"Services are arranged directly
with the provider"* — on a checkout screen. Beyond that:

- `listings.price_type` can be `from`, `hourly` or `per_kg`. A "from QAR 150"
  dreadlock job cannot produce an honest checkout total.
- There was no date or time anywhere, so a "bought" haircut had no appointment.
- Payment is cash regardless, so checkout moved no money — it just created a
  `pending` order that sat there until someone talked on WhatsApp.

## Why not plain WhatsApp either

A `wa.me` link is a dead end. The platform sees a click and nothing after: no vendor
record, no admin visibility, no dispute trail. That breaks the standing requirement
that everything in the app reports back to admin and vendor.

It also destroys the monetisation plan. The only thing that justifies charging a
service vendor is *"we sent you 47 bookings last month."* WhatsApp-only gives you
no evidence and no leverage at renewal.

So: **record first, then hand off.**

---

## The bug this fixed

Services were being **silently commissioned**. `billing.ts` had no `kind` filter:

```ts
goods = round2(goods + Number(o.subtotal));          // every order, any kind
commission_amount: round2(Number(o.subtotal) * commissionRate)
```

Every checked-out service order fed `commission_base` at the full rate. Under the
flat-fee plan a service vendor would have paid the listing fee *and* commission on
the same booking.

This is now fixed **by construction, not by a filter**. Services can no longer
become orders, so `computeStatement()` never sees them. There is no rule to
forget later.

---

## What was built

### Database — `005_service_bookings.sql`

`service_bookings` plus a `booking_status` enum
(`new → contacted → confirmed → completed`, with `cancelled` and `no_show`).

Two pairs of columns carry most of the design:

| Pair | Why |
|---|---|
| `preferred_at` / `scheduled_at` | What the buyer asked for vs what the vendor actually agreed. Keeping them apart is what makes availability addable later without a rewrite. |
| `quoted_price` / `quoted_price_type` | Price snapshot at booking time, so a later price edit cannot rewrite history. Indicative only — nothing is charged. |

`first_viewed_at`, `contacted_at` and `completed_at` are stamped automatically.
Those are the response-time metrics, and they exist because they are the commercial
argument for the fee.

Additive and idempotent.

### API — `bookings.ts`

| Route | Who | Purpose |
|---|---|---|
| `POST /bookings` | anyone | Create. Returns the row plus a prefilled `wa.me` link. |
| `GET /bookings/mine` | buyer | Own bookings. |
| `GET /bookings/track?code=&phone=` | public | Mirrors order tracking. |
| `POST /bookings/:id/cancel` | buyer | Before completion only. |
| `GET /bookings/vendor` | vendor | Inbox, filterable. |
| `GET /bookings/vendor/counts` | vendor | Drives the nav badge. |
| `PATCH /bookings/:id` | vendor | Work the booking. |
| `POST /bookings/:id/seen` | vendor | Stamps `first_viewed_at`. |
| `GET /bookings/admin` | admin | Everything. |
| `GET /bookings/admin/stats?days=` | admin | Demand and response time per provider. |

Guest booking is allowed, exactly as checkout is — forcing an account before a hair
appointment loses the booking.

### Web

- **`BookServiceModal`** — name, WhatsApp, optional email, preferred date/time or
  *"I'm flexible"*, and a note. On submit it writes the booking, then opens WhatsApp
  inside the same click so the browser does not block the pop-up.
- **`ListingDetail`** — services show **Request booking**; the qty stepper, cart
  button and "cash on delivery" line are gone for them. Products are untouched.
- **`CartContext`** — refuses a service in `add()`, and filters any left in a
  returning visitor's `localStorage` by an older build.
- **`VendorBookings`** — inbox with counts, a warning for unanswered requests, and
  the WhatsApp button auto-marks `contacted`.
- **`AdminBookings`** — *Bookings* tab for what is happening, *Providers* tab for
  who receives demand and who ignores it.

### The guard that matters

`orders.ts` `loadCart()` rejects `kind = 'service'` with a 422. Three layers block
it — UI, cart state, API — but only the API layer is load-bearing.

---

## Verification — 112 assertions, all passing

| Suite | Result |
|---|---|
| Booking live flow (`t_bookings.sh`) | **41 / 41** |
| `005` schema (`t_005.js`) | **36 / 36** |
| Billing regression | 17 / 17 |
| Order flow regression | 18 / 18 |
| XSS | pass |
| `004` schema | 10 / 10 |

Notable assertions:

- Booking a **product** is rejected 422 and points to the cart.
- Quoting **and** checking out a service are both rejected 422.
- A product still checks out: 2 × 40 + 25 delivery = **105**. Displayed equals charged.
- Cannot confirm without an agreed time; cannot schedule into the past.
- `track` with the right code but the wrong phone returns 404 — a guessed code leaks nothing.
- A buyer cannot PATCH a booking; a vendor cannot reach the admin view.
- **The 150 service price appears nowhere in a statement run.**

`tsc --noEmit` clean on `api` and `web`; `vite build` succeeds.

Two bugs were found and fixed during testing: the route checked `status = 'approved'`
when the enum is `('draft','active','paused','removed')`, and Postgres could not infer
the parameter type in the `scheduled_at` CASE without a `::text` cast.

---

## On the fee

Charging service vendors at approval is the right shape — there is no transaction to
take a cut of. Two cautions:

1. **A one-time approval fee earns nothing from a vendor who books 200 jobs a year.**
   A recurring monthly listing fee tracks the value delivered. The `Providers` tab
   gives you the per-vendor numbers to price it.
2. **You do not need new billing machinery.** `004_payouts_email.sql` already has
   `payout_batches` and statements; a flat vendor fee can ride on the existing
   statement as a line item.

## Not built, deliberately

**Vendor availability** — working hours, time off, slot conflicts. It needs
`vendor_hours` and `vendor_time_off` tables and a conflict check on insert, and
`listings.duration_mins` already exists to act as the slot length. Building it now
would mean guessing how these vendors work before a single booking has been taken.

The `preferred_at` / `scheduled_at` split is the seam. When availability lands, the
API validates `preferred_at` against it and auto-fills `scheduled_at` — nothing
above needs to change.

**No email on booking.** `mailer.ts` is wired and available, but `EMAIL_PROVIDER` is
still `none` in production, so a notification would silently no-op. Worth adding once
the key is set — see `EMAIL-SETUP.md`.
