# Sokoni Hub consumer marketplace UI template

This patch redesigns the consumer-facing Sokoni Hub website using an original, image-led marketplace layout inspired by the visual organisation of the supplied reference site. It uses Sokoni Hub’s own teal and orange logo colours, current images, routes, API data, cart, checkout, store data, listings, services, and authentication flows.

## Included consumer UI changes

- Compact marketplace announcement strip and commerce-style header.
- Hero with Sokoni Hub imagery, search, city/type controls, quick categories, and marketplace CTA styling.
- Rounded photo-led category tiles and product/service cards.
- Product-shelf styling for live listing data.
- Softer catalog filters, store cards, listing detail, cart, checkout, authentication, tracking, account, footer, and public card/button surfaces.
- Responsive website styling for phone and desktop browsers.

## Deliberately excluded

- `mobile/` application: unchanged.
- Vendor dashboard routes (`/vendor/*`): unchanged.
- Admin dashboard routes (`/admin/*`): unchanged.
- Backend APIs, data structures, and marketplace behaviour: unchanged.

The template stylesheet is scoped to `.marketplace-app`, which is used only by the public/buyer layouts. Existing real Sokoni Hub data continues to populate every component.

## Files

Add or replace these paths:

- **New:** `web/src/styles/MarketplaceTemplate.css`
- **Replace:** `web/src/components/Layout.tsx`
- **Replace:** `web/src/pages/Home.tsx`

Run the normal Netlify deployment after committing these files. No database migration or Render configuration is required for this visual patch.
