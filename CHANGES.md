# Sokoni Hub: fixes in this bundle

Copy each file over the same path in your project (the paths are relative to the repo root).

## 1. Driver app: "Could not confirm pickup / Something went wrong"
- File: driver/src/api.ts
- Cause: the API reports errors as { error }, but the driver app only read { message }, so every failure showed a generic message.
- Fix: read `error` first, then `message`, and pass along `details`/`errors`.
- Note: the pickup rule itself still applies. The rider must be within 150 m of the store, and the store needs a map location. The rider will now see the real reason if either fails.

## 2. Consumer app: "Book now" button on services
- Mobile: mobile/src/booking.tsx and mobile/src/ui.tsx
  - The "Book now" button is now a compact pill (40 px tall, 13 px text, auto width) instead of a 48 px button with a 160 px minimum width.
  - `Button` gets an optional `textStyle` prop, so text size can be changed per button.
- Web: web/src/styles.css and web/src/styles/MarketplaceTemplate.css
  - The web "Book now" pill is 30 px tall and sized to its text.
  - Phones (up to 640 px) show two-column product grids, the usual shop-grid layout.
  - Tablet and iPad widths keep their multi-column grids.

## Checks run
- Driver: `tsc --noEmit` passes.
- Mobile: `tsc --noEmit` passes (0 errors). Native Android/iOS builds were not run.
- Web: `vite build` passes. Layout checked with screenshots at 360, 375, 768, and 1024 px.
