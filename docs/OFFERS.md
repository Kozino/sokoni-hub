# Offers, coupons and free delivery

Sokoni Hub can now run discounts, coupon codes and free or reduced delivery **without an app update**. An admin creates
an offer, switches it on, and the app shows it. Sokoni Hub pays for every offer: vendors are still paid the full price of
their goods and riders the full delivery fee. Only the cash the customer hands over is lower.

Nothing is live until an admin switches it on. A new offer is saved as a draft.

- Database: `db/migrations/031_offers.sql`
- Pricing: `api/src/offers.ts` (used by both `POST /orders/quote` and `POST /orders/checkout`)
- API: `api/src/routes/offers.ts` (public list and admin), `api/src/routes/guestPush.ts`, `api/src/campaignPush.ts`
- Admin page: `web/src/pages/admin/AdminOffers.tsx` (Admin, Commerce, **Offers & coupons**)
- Customer app: `mobile/src/offersUi.tsx`, `mobile/src/screens/Offers.tsx`, `mobile/src/links.ts`, `mobile/src/openLink.ts`
- Tests: `tests/offers.mjs`, `tests/offers-engine.mjs`, `tests/mobile-links.mjs`

---

## 1. How the money works

An order keeps its two payout numbers exactly as before and records the discount **beside** them:

| Column | Meaning | Used for |
| --- | --- | --- |
| `subtotal` | Full goods value | Vendor wallet credit and vendor statements |
| `delivery_fee` | Full delivery fee | Rider pay |
| `discount` | Goods discount (Sokoni Hub pays) | Reporting |
| `delivery_discount` | Delivery discount (Sokoni Hub pays) | Reporting |
| `total` | `subtotal + delivery_fee - discount - delivery_discount` | **What the buyer pays, and what the rider collects** |

The database enforces that equation (`orders_total_matches`), so a mistake fails loudly instead of mispricing an order.

### Worked example: 60 QAR of goods, 10 QAR delivery, code `WELCOME10` (10% off, up to 15)

| | Amount |
| --- | --- |
| Buyer pays the rider in cash (`total`) | 64 |
| Rider keeps their delivery fee (`fee_earned`) | 10 |
| Vendor wallet is credited (`subtotal`, less normal commission) | 60 |
| Sokoni Hub collected 64 and pays out 60 + 10 = 70, so it funds | **6** |

### Free delivery

Delivery is free for the buyer but the **rider is still paid the full fee**. The fee stays on the order as `delivery_fee`, and the same
amount is recorded as `delivery_discount`. The buyer pays no delivery, the rider collects less cash, and Sokoni Hub covers the difference.

### Store collection (the vendor holds the cash)

The buyer pays the vendor the lower total at the counter. The vendor statement counts the cash actually collected (`subtotal - discount`)
against the full amount owed, so the vendor is credited the discount. Statements show a line: *Sokoni Hub offers (buyers paid less; credited to you)*.

### Guard rails

- A customer always pays **at least 1 QAR per order**, so a rider always has cash to collect (the driver app requires a cash confirmation).
- **One goods offer and one delivery offer** per order at most. A code the customer typed wins over automatic offers of the same kind.
- A cart with several sellers is one checkout: minimum spend is checked on the whole cart and the saving is shared between the seller orders to the cent.
- **Limits are enforced under load.** Offers with limits are locked for the length of the checkout, so two buyers cannot both take the last use.
- **Cancelled orders free their use and their budget.** Nothing runs in the background to do this: usage is counted from non-cancelled orders each time.
- An offer is live only inside its dates, evaluated against the clock on every request. Nobody has to remember to switch anything off.

---

## 2. Admin guide

Open **Admin, Commerce, Offers & coupons**.

### Create an offer

| Field | Notes |
| --- | --- |
| Title | What customers read, e.g. "10% off your first order" (3 to 80 characters) |
| Description | Optional one line under the title |
| Customer enters a code / Applies automatically | A code is typed in the Cart. Automatic offers apply when the cart qualifies. Codes are 3 to 24 letters, numbers, `-` or `_`, in any case. **Generate** makes a random one. |
| Type | Percentage off the items, fixed amount off the items, free delivery, percentage off delivery, fixed amount off delivery |
| Percentage or amount | 1 to 100, or a QAR amount |
| Most one order can save | Optional cap per checkout (QAR) |
| Minimum spend | On the items the offer applies to |
| Orders | Delivery and collection, delivery only, or collection only (a delivery offer cannot be collection-only) |
| Applies to | Everything, one store, or one category |
| First order only | Customers with an earlier (non-cancelled) order are not eligible |
| Total uses / Per customer / Budget | See below |
| Starts / Ends | The end must be in the future |
| Show in the app's Offers | Turn off for a private code you hand out yourself |
| Badge, Order in the list, Colour | Look and order in the app |

A live preview and a plain-English sentence ("Customers get 10% off, up to QAR 15 when they spend QAR 40 or more...") show exactly what you are about to publish.

### Limits (use them, because the platform pays)

- **Total uses**: how many checkouts may use the offer.
- **Per customer**: by account **and** by phone number, so a guest cannot use a once-only code twice.
- **Budget (QAR)**: the offer switches itself off when this much has been funded, and the last order is capped to what remains.

### Going live

- **Save as draft** (the default): nothing reaches customers.
- **Go live** is a separate, deliberate action with a confirmation that restates what customers get and who pays.
- **Pause** takes effect immediately. Orders already placed keep their discount.
- Status: Draft, Scheduled (on, but not started), Live, Paused, Ended, Used up.

### Editing and deleting

- Wording, dates, limits and amounts can be edited at any time. Changes affect future uses only; each order keeps a snapshot of what was applied.
- Once an offer has been used, its **code and type are locked**. Pause it and create a new one instead.
- An offer nobody has used can be deleted. A used one is paused, so the record of what it cost is never lost.
- An offer that has already ended cannot be created or switched back on without new dates.

### Notifications

**Notify** (on a live or scheduled offer) or **Send a notification** (general) sends a push to customers. Choose everyone, signed-in customers or guests, and where a tap opens
(the Offers screen, browse, services, or the offer's store or category). It goes to **customers only**: vendors and riders never receive it. One campaign per minute.

### Reading the numbers

The tiles show offers live now and what Sokoni Hub has funded today, this month and all time. Each offer shows its uses and funded amount (and a budget bar). **Uses** lists the orders.

---

## 3. What customers see

- **Explore**: "Offers for you", a rail of two complete cards (three on tablets). **Profile, Offers & coupons** lists everything live.
- **Cart**: a Promo code card, "Add X QAR more for FREE delivery" hints from the server, and the summary with the discount and the delivery fee struck through when waived.
- **Checkout**: the same lines. If the total changed since the customer saw it, checkout asks them to review it instead of charging something different.
- **Order placed**, **order details** and the **PDF receipt**: the discount lines, the promo code, and "You saved X".
- **Notifications** open the screen they are about. Guests can receive offer notifications (and never order alerts).

---

## 4. API

### Customer

`GET /api/offers` returns what the app lists: offers that are on, listed, inside their dates and not used up. A signed-in customer no longer sees a once-only offer they have already used.
Limits and budgets are never exposed.

`POST /api/orders/quote` and `POST /api/orders/checkout` take three optional fields. **Clients that do not send `offers` or `promo_code` are priced exactly as before** (the web storefront, older app builds).

| Field | Where | Meaning |
| --- | --- | --- |
| `offers: true` | quote, checkout | The client can show discount lines |
| `promo_code` | quote, checkout | The code the customer typed (any case) |
| `expected_total` | checkout | The total the customer was shown. A mismatch is refused with 409 so they can review it |
| `contact_phone` | quote | Lets a guest's per-customer limits be checked before checkout |

With offers on, the quote adds `discount`, `delivery_discount`, `applied_offers[]`, `hints[]` and `promo { code, ok, message }`; each entry of `vendors[]` gets `discount`, `delivery_discount`
and a `total` that is what the buyer pays. `delivery_fee` is always the full fee.

A typed code that fails at checkout stops the order (409) rather than being silently dropped, because the customer was shown a total that included it.

**Guessing codes is throttled.** Wrong guesses are counted per customer (IP for guests). After 60 in 15 minutes, every code lookup from that customer is answered identically ("Too many wrong codes"), right or wrong,
with the code ignored. The cart keeps working without it. Expired or used-up codes are not counted.

`POST /api/guest-push/device` and `DELETE /api/guest-push/device/:token` register a phone that is not signed in, for offer notifications only. Rate limited.

### Admin (admin accounts only)

| Method and path | Purpose |
| --- | --- |
| `GET /api/offers/admin` | Every offer with its state, uses and funded amount |
| `GET /api/offers/admin/summary` | Live, scheduled and draft counts; funded today, this month, all time |
| `POST /api/offers/admin` | Create (always as a draft) |
| `PATCH /api/offers/admin/:id` | Edit (code and type lock after first use) |
| `POST /api/offers/admin/:id/activate` / `pause` | Switch on or off |
| `DELETE /api/offers/admin/:id` | Only an unused offer |
| `GET /api/offers/admin/:id/redemptions` | The orders that used it |
| `GET /api/offers/admin/push/audience` / `history` | Devices a campaign reaches, and past campaigns |
| `POST /api/offers/admin/push` | Send a campaign to customers |

---

## 5. Rolling it out

Order matters only for tidiness: the new code is safe to deploy **before** the migration (offers stay off and checkout behaves as before, verified in testing).

1. **Back up the database.**
2. Run the migration: `cd api && npm run migrate:prod` (applies `031_offers.sql`, which is additive: new tables, and four new `orders` columns with defaults).
3. Deploy the API (`npm run build`, restart).
4. Deploy the web admin.
5. Open **Admin, Offers & coupons**, create a test offer as a draft and confirm nothing appears in the app. Switch it on, check the app, then pause or delete it.
6. Release the mobile app (an EAS build; it also needs the `expo-sharing`, `expo-print` and `expo-file-system` modules from the PDF receipt update).

**Rolling back**: pause all offers. The app then shows no offers and prices everything normally. The migration is additive and does not need to be undone.

---

## 6. Compatibility

- **Vendor app and driver app are unchanged.** Their API responses keep every existing field and meaning. The new order fields (`discount`, `delivery_discount`, `promo_code`, `offers_applied`) are extra and ignored by older builds.
  - The driver app's "Collect X before handoff" uses `order.total`, which is now the discounted amount: exactly what the rider should collect.
  - Rider earnings use `delivery_fee` and vendor wallet credit uses `subtotal`: both unchanged.
- **Vendor dashboard revenue** now sums `subtotal + delivery_fee` instead of `total`, so a platform-funded discount never lowers a vendor's revenue. For every order placed before offers existed the two are identical.
- The vendor app's own "today's sales" tile adds up order totals on the phone, so it counts what customers paid. The vendor's wallet and statements are unaffected. Showing the Sokoni Hub contribution in the vendor app would need a vendor-app update and is optional.
- **Web storefront and older app builds** do not send the offers flag, so they are priced as before. Offers apply in the new mobile app.
- A statement for store-collection orders now includes the discount credit. Statements without discounted orders are unchanged.

---

## 7. Tests

```bash
cd api && npm run build
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/sokoni_test   # an isolated *_test database
node tests/offers.mjs            # 140 checks: money, rider, vendor, statements, limits under a race, admin, push
node tests/offers-engine.mjs     # 27 checks: the pricing rules, no database needed
node tests/mobile-links.mjs      # 38 checks: deep links and notification taps
node tests/money-wallet.mjs && node tests/rider-flow.mjs && node tests/deletion.mjs   # existing suites, unchanged
```

`tests/security.mjs` has one failing check that was already failing before this work ("other vendor cannot cancel order").

## 8. Not included yet

- A promo-code field on the web storefront (it can start sending `offers: true` and `promo_code` the same way).
- Per-product sale prices (a crossed-out price on a listing).
- Showing the Sokoni Hub contribution inside the vendor app.
- Privacy policy wording: the app now stores an anonymous notification token for people who are not signed in, used only for offer notifications. Review the policy text before release.
