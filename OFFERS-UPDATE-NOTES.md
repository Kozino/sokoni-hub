# Offers, coupons and free delivery: update notes

Sokoni Hub can now run discounts, coupon codes and free or reduced delivery that **Sokoni Hub pays for**, controlled from the admin,
with no app update needed for new campaigns. **Nothing is live until an admin switches it on.**

Vendors still receive the full goods value and riders the full delivery fee. The customer simply pays less cash.
The vendor app and the driver app are **not changed**.

Read `docs/OFFERS.md` for the admin guide, the money model and the API.

## What is in this package

43 files, all under the folders they belong to (api, db, docs, mobile, tests, web). Nothing else in your repository is touched:
`vendor-app/`, `driver/`, `api/src/push.ts`, `api/src/routes/drivers.ts`, `api/src/walletSettlement.ts` and `api/src/delivery.ts` are exactly as they are on GitHub.

Two ways to apply it (use one):

1. **Unzip over your repository root** (folders merge), then commit and push.
2. Or, from the repository root: `git apply offers.patch` (it applies cleanly to GitHub `main` at 136b191).

## Roll-out, in this order

1. Back up the database.
2. `cd api && npm run migrate:prod` applies `db/migrations/031_offers.sql`. It is additive (four new tables, four new `orders` columns with defaults). Existing orders are unchanged.
   The new API code is safe to deploy before the migration (offers simply stay off), so the order is for tidiness, not safety.
3. Deploy the API (`npm run build`, restart) and the web admin.
4. In the admin open **Commerce, Offers & coupons**. Create a test offer, leave it as a draft, and check that the app shows nothing. Switch it on, check the app, then pause it.
5. Release the mobile app with a new EAS build.

To switch everything off at any time, pause the offers. Nothing needs to be rolled back.

## What was verified

- The existing suites are unchanged: money 16, rider flow 11, deletion 51. `security.mjs` still passes 39 checks and stops at the check that was already failing before this work ("other vendor cannot cancel order").
- New: `tests/offers.mjs` 140 checks (a real database and the real API: orders driven through vendor, rider and buyer; money; statements; limits under a race; admin; push audiences),
  `tests/offers-engine.mjs` 27 checks, `tests/mobile-links.mjs` 38 checks.
- The new code was run against a database **without** the migration to prove deploying early cannot break ordering, tracking, vendor dashboards, statements or the admin page.
- The customer app was run against the real API and database: it listed live offers, applied a code, placed an order, and the order, discount and redemption were stored correctly.
- Web admin: type-checked and built, and used in a browser at desktop and phone width. Mobile: type-checked, plus real Android and iOS bundles.

## What was not verified (needs your devices)

- Push notifications on real phones. The server's audience and message content are tested (customers and guests only, never vendors or riders), but delivery through Expo to a physical Android and iPhone needs a try on your side.
- The customer app on physical Android and iOS devices (checked in a browser and as native bundles).
- The PDF receipt share sheet (from the previous update) and the live rider map still need a real-device check.

## Good to know

- **Who sees offers.** Offers apply in the new mobile app. The web storefront and older app builds are priced exactly as before.
- **Vendor app.** The "today's sales" tile in the vendor app adds up order totals, so it counts what customers paid. Vendor wallets, statements and the vendor web dashboard use the full value.
- **Privacy policy.** The app now stores an anonymous notification token for people who are not signed in, used only for offer notifications. Please review the policy wording before release.
- **Money safety.** A customer always pays at least 1 QAR per order, so a rider always has cash to collect. Use the budget and per-customer limits on every offer: the platform pays for them.
