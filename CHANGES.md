# Sokoni Hub: fixes in this bundle

Copy each file over the same path in your project (paths are relative to the repo root).

## 1. Driver pickup: "Could not confirm pickup / Something went wrong"
- driver/src/api.ts: reads the API's `error` field (it was reading `message`), so the rider sees the real reason.

## 2. Store map pin, navigation, and pickup (new)
- Vendors set their store's map pin on the web app (Store profile). Vendors do not use the mobile app.
  - web/src/pages/vendor/VendorProfile.tsx: "Store location on the map" field using the map picker, saved with the profile.
  - web/src/components/DeliveryPin.tsx: copy is now configurable (`emptyText`). Buyer wording is unchanged.
  - web/src/pages/vendor/VendorLayout.tsx: warning banner on every vendor page until the pin is set.
- A store without a pin cannot take orders. api/src/routes/orders.ts (`loadCart`) returns 422 for it, so both quote and checkout refuse it.
- Moving the pin does not send a verified store back for review (api/src/routes/vendors.ts). Address, name, and licence changes still do.
- Driver app: after accepting an order, "Navigate" opens directions to the store's exact pin (driver/src/format.ts `mapsPointLink`). It falls back to the typed address only if no pin exists.
  - driver/src/screens/ActiveDelivery.tsx, driver/src/screens/types.ts.
  - api/src/routes/drivers.ts: the driver's order list now includes `store_lat` and `store_lng`.
- Pickup still requires the rider to be within 150 m of the pin. The error now says how far away the rider is.

## 3. Consumer "Book now" on services (compact, responsive)
- Mobile: mobile/src/booking.tsx and mobile/src/ui.tsx. A compact 40 px pill. `Button` gets a `textStyle` prop.
- Web: web/src/styles.css and web/src/styles/MarketplaceTemplate.css. A 30 px pill. Phones show two columns. Tablets and iPads keep multi-column grids.

## 4. Tests
- tests/money-wallet.mjs, tests/security.mjs, tests/bookings-api.mjs, tests/deletion.mjs: test vendors now have a map pin, since the checkout rule requires one.

## Checks run
- API: `tsc` and `build` pass. Integration suites pass against Postgres 17: money-wallet 16/16, security 68/68, bookings 34/34.
- Driver: `tsc --noEmit` passes.
- Mobile: `tsc --noEmit` passes.
- Web: `tsc --noEmit` and `vite build` pass.

## Not yet verified
- A direct check that checkout refuses a store with no pin (the rule is in place; no test was added for it yet).
- Native Android and iOS builds, and the driver app on a device.
- Vendor onboarding does not yet ask for the pin. The profile page and banner cover existing vendors.
