# Sokoni Hub: Service fees and monthly platform bill

Unzip at the repo root (paths are relative to repo-main/). Existing files are overwritten.

## Files
API (api/src): routes/admin.ts, routes/bookings.ts, routes/listings.ts, routes/vendors.ts, routes/wallet.ts, server.ts, serviceFees.ts, serviceFeeBills.ts (new monthly bill logic), serviceFeeSchedule.ts (new scheduler), routes/bookings.ts (overdue-bill booking block)
DB migrations: db/migrations/029_service_fees.sql, db/migrations/030_service_fee_bills.sql
Web: components/ServiceFeeBillsVendor.tsx (new), components/ServiceFeesAdmin.tsx, pages/admin/AdminMoneyModel.tsx, pages/vendor/VendorPlans.tsx, pages/vendor/VendorWallet.tsx
Vendor app: src/screens/Account.tsx (row text mentions the platform bill)

## Deploy steps
1. Run migrations: `cd api && npx tsx src/scripts/migrate.ts` (adds 029 and 030).
2. Deploy the API. The monthly scheduler starts with the server. It is OFF by default.
3. Admin dashboard > Service fees: set the flat fee and mode (every_booking or new_clients), enable plans if wanted, and turn the monthly bill run ON with the day (1-28) and hour (Qatar time).
4. Build the web app with VITE_API_URL=https://api.sokonihub.qa.
5. Build the vendor app as usual (no native changes in this update).

## Behaviour
- One bill per vendor per closed calendar month, with a due date.
- Vendors pay by bank transfer (reference and receipt, admin confirms) or by wallet netting at payout (oldest bill first, automatic).
- The bill is on the web Wallet page.
- A vendor with an open bill past its due date cannot take new bookings (API returns 409 "This provider is not taking new bookings right now."). It lifts when the bill is paid or netted at payout. A submitted bill (receipt sent, awaiting admin) does not block.
- The scheduler runs every 5 minutes. It uses a Postgres advisory lock and is idempotent per month. Failures are kept in last_error and retried.
