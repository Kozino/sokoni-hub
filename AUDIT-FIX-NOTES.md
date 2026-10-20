# Audit fixes, round 2

Copy each file over the same path in the repo (paths are relative to the repo root). No database migration.

## Web
- `web/src/pages/Home.tsx`: hero image uses the lowercase `fetchpriority` attribute. Fixes the React "does not recognize the fetchPriority prop" warning on the consumer home.
- `web/src/components/WhatsAppWidget.tsx` + new `WhatsAppWidget.css`: floating support button moved to a CSS class, 52px on phones, above the safe area, with bottom page padding on phones so it doesn't cover content.
- `web/src/components/Layout.tsx`: account button no longer forces 34px.
- `web/src/styles.css`: header icon buttons, burger and brand row are 44px; on dashboards the site burger is hidden so there is one menu (the dashboard's own menu button).
- `web/src/styles.css`, `web/src/pages/vendor/vendor-classic.css`: muted text tokens darkened to at least 4.5:1 (light #5C6378, dark #8A91A5).
- Font sizes below 12px raised to 12px in CSS and inline styles (`styles.css`, `Home.css`, `StorePage.css`, `legal.css`, `account.css`, `MarketplaceTemplate.css`, `AdminOverview.tsx`, `AdminSubscriptions.tsx`, `VendorOverview.tsx`, `VendorPlans.tsx`).
- `web/.env.example`: Mapbox token block (`VITE_MAPBOX_TOKEN=`).

## Mobile (consumer)
- `mobile/src/booking.tsx`: "Book now" bar is compact. Phone: 44px tall, 118–160px wide. Tablet/iPad: 148–200px wide. Labels 12–13px. Never stretched across the bar.

## Driver
- `driver/package.json`, `driver/package-lock.json`: `expo-file-system` (used by `ActiveDelivery.tsx`). The lock file already contained the entry; `npm ci` passes.

## Checks run
- web: `tsc --noEmit` and `vite build` pass.
- mobile: `tsc --noEmit` passes; `expo export` passes for Android and iOS.
- driver: `npm ci` and `tsc --noEmit` pass.
- api: `npm run build` passes.
- Browser (phone 390px): no console errors on /, /browse, /vendors, /cart, /track. Vendor dashboard shows one menu.
