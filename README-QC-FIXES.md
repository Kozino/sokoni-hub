# Sokoni Hub: QC fixes (all items except the email items)

Base: GitHub `main` at commit ba98ef8. Every file in this zip is either new or replaces the same path in `main`. Copy the files over the repo, keep the same paths, then commit.

## Before you deploy

1. **Run the database migration** `db/migrations/027_qc_fixes.sql` (the server's `npm run migrate` does this). It adds payment status, pickup evidence, and the rider cash ledger. It is additive and safe to re-run.
2. **Rebuild the rider (driver) app.** Background location needs a new native build: new Android permissions, and the new `expo-task-manager` package. The consumer app needs no native change.
3. Build the apps with the EAS workflow for Android and iOS, as before. iOS stays simulator-only until App Store Connect is ready.

## What changed, by QC item

- **Item 2 (money model): done, with one active mode.** Buyer payments are card and cash on delivery only.
  On the admin **Billing > Settings** page, the admin picks one money model. Changing it takes effect straight away, with no code change:
  - **Commission per order** (the model used by delivery companies such as Talabat): takes the commission rate set on that page from each delivered product order. Plan limits do not apply, and vendors need no plan.
  - **Monthly subscription plans:** vendors buy Standard or Pro plans, and plan limits apply. No commission is charged. Plan purchases are refused on the server while this mode is not active.
  Subscription mode is the default and the fallback. The server never allows both modes at once.
- **Delivery fee belongs to the rider.** Every delivery is done by a Sokoni rider, so the fee is never vendor revenue. It is excluded from vendor sales, the vendor balance, commission, and the vendor's wallet, and it is shown on statements as "Delivery fees (paid to riders)" for information only. Riders are credited through the rider ledger.
- **Sokoni Hub settles the vendor for rider-delivered orders, in both money models.** A rider cannot return cash to the vendor, so the cash the rider collects goes to Sokoni Hub, which pays the vendor. Commission is charged only in commission mode. Plan limits apply only in subscription mode.
- **Vendor wallet (rider-delivered orders):** when a Sokoni rider completes a drop-off, the vendor's share (product sales less commission, where commission mode is on) is credited to the vendor wallet as **pending**. When the order is final (buyer confirms, or the auto-complete window passes), the amount moves to **available** for payout. Each step runs once, so retries never double-credit. Vendor-collected orders keep using vendor statements, so nothing is paid twice.
- **Driver cash:** cash a Sokoni rider collects is handed to Sokoni Hub, which settles the vendor. The admin and driver screens now say "Handed to Sokoni Hub".
- **WhatsApp ordering removed everywhere:** no WhatsApp ordering or vendor-messaging buttons, links, or copy remain in the API, web, mobile, or driver apps. The payment option is gone, so cash on delivery is the only buyer payment method. Platform support WhatsApp contacts are kept. Vendors enter a phone number, not a WhatsApp number.
- **Automated tests:** `npm run test:money` (in `api/`) checks the money-model switch, commission and subscription wallet credits, the pending-to-available flow and idempotency. It runs against an isolated `*_test` PostgreSQL database.
- **Item 3 (stuck orders) and item 4 (push and vendor alerts):** done in the earlier round, kept as they were.
- **Item 5 (driver payout and cash reconciliation): done.** Every cash-on-delivery order a rider completes is recorded in a ledger: cash collected and the delivery fee earned. Admins record cash handed in and fee payouts on the Drivers page ("Rider cash and fees"). Balances can never go below zero. Where the cash goes after handover follows the money model switches above.
- **Item 6 (5 km radius):** the store's delivery radius is now enforced when an order is placed. Delivery needs a map pin, and the pin must be inside the radius. A store without a map location cannot take delivery orders. The buyer sees a clear message.
- **Item 7 (collection orders shown as delivery jobs):** only delivery orders appear as rider jobs and trigger rider alerts.
- **Item 8 (offline riders accept jobs):** offline riders see no jobs and cannot accept any.
- **Item 9 (store edits take the store offline):** saving the store form no longer counts blank fields or unchanged map pins as changes. Changing the store name, phone, country, city, address, CR licence, or map pin still sends a verified store back for review. Description and logo changes never do.
- **Item 10 (pickup and proof can be faked):**
  - Pickup needs the rider's GPS within the geofence of the store (150 m by default, editable in admin settings). The distance is recorded.
  - Drop-off needs GPS within the geofence of the buyer's pin. The proof photo must be uploaded by that rider in the app. Links to other photos are refused.
  - Delivery orders must have a map pin.
- **Item 11 (CR licence optional):** the CR or business-registration licence is required to apply, on the form and on the server. An admin cannot verify a store that has no licence.
- **Item 12 (payment status):** orders show Paid or Unpaid. Cash on delivery becomes Paid when the order is handed over. The rider app shows the amount to collect before hand-over.
- **Item 13 (buyers cannot cancel):** buyers can cancel from the tracking page (web and app) until a rider accepts the order. Reserved stock is returned. After that, the buyer contacts the store.
- **Item 14 (background location):** while a rider is online, the app keeps sending their location in the background. On Android it runs as a foreground service with a notification. Going offline or signing out stops it.
- **Consumer tracking:** the rider's name, vehicle, and call button are shown when a rider is assigned (already in this build).

## Checks run before packaging

- Automated tests against a real Postgres database: 57 checks passed, covering every item above, including the money-model switches.
- Type checks passed for the API, web, consumer app, and rider app.
- Web production build passed.
- Both apps bundle for Android and iOS.
- The rider app's iOS settings were generated and checked.

## Not yet checked on real devices

- Background location on a real Android or iPhone while the screen is off.
- Push delivery to real devices.
- The full EAS build.
