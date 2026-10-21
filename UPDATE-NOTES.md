# Sokoni Hub update: all changes in one zip

Unzip at the repo root (paths are relative to repo-main/). Existing files are overwritten.

## What is in it
1. Service booking fees and monthly platform bill (new)
   - Flat booking fee set by admin (every booking or new clients only), optional monthly plans.
   - One bill per vendor per closed calendar month, with a due date.
   - Vendors pay by bank transfer (reference and receipt, admin confirms), or open bills are netted from the next wallet payout (oldest first).
   - Bill is on the web Wallet page.
   - Monthly bill run: admin turns it ON/OFF and sets day (1-28) and hour (Qatar time) in Service fees. OFF by default.
2. Overdue bill blocks new bookings
   - A vendor with an open bill past its due date cannot take new bookings (409: "This provider is not taking new bookings right now."). Lifts when paid or netted. A submitted bill (receipt sent, awaiting admin) does not block.
3. Short booking codes
   - Booking codes now use 16 characters after the prefix (BKG-XXXXXXXXXXXXXXXX), the same length as order codes. Existing booking codes do not change.
4. Vendor store profile fix
   - Login now returns the full store profile, so Description, Country, City, Phone, Shop address and the map pin stay filled after you log in again.
5. Vendor sidebar: Sign out button after "Account deletion" (vendors only).
6. Vendor app: Account row now mentions the platform bill.

## Deploy steps
1. Run migrations: `cd api && npx tsx src/scripts/migrate.ts` (adds 029 and 030).
2. Deploy the API.
3. Build the web app with VITE_API_URL=https://api.sokonihub.qa.
4. Build the vendor app as usual (no native changes in this update).
5. In admin, Service fees: set the fee, plans if wanted, and the monthly bill run.

## Files
API: api/src/routes/admin.ts, bookings.ts, listings.ts, vendors.ts, wallet.ts, auth.ts, server.ts, serviceFees.ts, serviceFeeBills.ts, serviceFeeSchedule.ts
DB: db/migrations/029_service_fees.sql, db/migrations/030_service_fee_bills.sql
Web: components/ServiceFeeBillsVendor.tsx, components/ServiceFeesAdmin.tsx, components/DashShell.tsx, styles.css, pages/admin/AdminMoneyModel.tsx, pages/vendor/VendorPlans.tsx, pages/vendor/VendorWallet.tsx, pages/vendor/VendorLayout.tsx
Vendor app: src/screens/Account.tsx
