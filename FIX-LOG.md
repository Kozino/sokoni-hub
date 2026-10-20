# Audit fixes: rider app and consumer app

Replace or add these files at the same paths. Then:
- API: `cd api && npm run build` (the new routes are in the compiled output).
- Rider app: `cd driver && npm install` (no new packages; expo-file-system was already listed).
- Consumer app: `cd mobile && npm install`.

## Verified
- API type-check, build, and test suites: money 16/16, security 68/68, bookings 34/34.
- New test `tests/rider-flow.mjs`: 11/11 (pickup distance, arrival geofence, pickup after arrival, release after arrival, rider PIN change, rider deletion request).
- Rider app and consumer app type-check clean (tsc).
- Both apps export a JavaScript bundle for Android and iOS (`expo export`).
- Not run: native Android/iOS builds (Gradle, Xcode) and on-device tests.

## Rider app
| ID | Fix | Files |
|---|---|---|
| D1 | "I have arrived at the store" step. New `POST /drivers/orders/:id/arrive` uses the store geofence and notifies the buyer ("Rider at the store"). Pickup and release also accept the arrived state. | api/src/routes/drivers.ts, driver/src/screens/ActiveDelivery.tsx |
| D2 | Requests show km to pickup (from the rider's last position). | api/src/routes/drivers.ts, driver/src/screens/Home.tsx, driver/src/screens/types.ts |
| D3 | Rider account deletion: Settings > Account > Delete account (password, reason, confirmation). Riders are allowed on the deletion routes. Admin completion is blocked while the rider has an open delivery or holds cash. | driver/src/screens/settings/DeleteAccount.tsx, driver/src/screens/Settings.tsx, api/src/routes/deletion.ts |
| D4 | Rider Change PIN (Settings). `/auth/pin/change` now allows riders. | driver/src/screens/settings/ChangePin.tsx, driver/src/screens/Settings.tsx, api/src/routes/auth.ts |
| D5 | Proof photo copied to device storage per order, restored on reopen, deleted after a successful delivery. | driver/src/screens/ActiveDelivery.tsx |
| D6 | PIN setup asks for the PIN twice. | driver/src/screens/Pin.tsx |
| D7 | Debug logging removed. | mobile/src/usePushNotifications.ts (rider app had none) |

## Consumer app
| ID | Fix | Files |
|---|---|---|
| C1 | Account > Security > Delete account (password, reason, confirmation). Uses the existing `/account-deletion` API. | mobile/src/screens/Account.tsx |
| C2 | Rider card already existed on Track (name, vehicle, phone). The button now reads "Contact driver" to match the agreed wording. | mobile/src/screens/Track.tsx |
| C3 | Book now is responsive: breakpoints (phone under 600, tablet 600–1023, iPad 1024+), a 560 pt centred column on tablets and iPads, and a compact 44 pt button. | mobile/src/layout.ts, mobile/src/booking.tsx |
| C4 | WhatsApp removed from the booking screen's code (unused state and response type). The vendor's contact column is still named `whatsapp` in the database and the vendor web app. | mobile/src/booking.tsx |
| C5 | "Track an order" button in the My orders header. | mobile/src/screens/Orders.tsx |
| C6 | Shared spacing, radius and breakpoint tokens added in layout.ts and used by the Book now screen. Other screens still use inline styles (see notes). | mobile/src/layout.ts |

## Notes
- C4: renaming the vendor `whatsapp` column needs a database migration and a change to the vendor web app. It was not renamed to avoid breaking existing data.
- C6: only the Book now screen uses the new tokens. Moving every screen off inline styles is a larger refactor and was not done.
- D3: the deletion request itself is allowed while a delivery is open. The block applies when the admin completes the deletion, and the screen says so.
- Setting a PIN directly in the database signs the user out (existing security trigger). The test accounts for this.
