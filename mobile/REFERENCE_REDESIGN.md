# Reference-led consumer redesign

The five supplied reference screens are implemented as the visual direction for the Sokoni Hub consumer experience:

- compact Doha/QAR market header, white/off-white canvas, emerald primary surfaces, soft lavender utility panels and citrus/orange action buttons;
- a fixed, Android-safe five-item consumer bottom navigation bar: Explore, Categories, Services, Cart and Profile;
- bold, card-led buyer sign-in and a dedicated four-digit PIN screen;
- colourful local-market discovery with location/search/filter controls, quick categories, seller trust signals, category cards, listing grids and direct seller/service pathways;
- a colourful product/service display with seller profile, pricing, stock/service details, reviews, related listings and a fixed purchase action;
- merchant-grouped cart with quantity controls and a clear, server-priced checkout hand-off;
- specialist/service booking with service, visit location, preferred-time, contact details and price-summary sections;
- restructured buyer profile/account with fixed bottom navigation clearance, shortcuts, buyer activity, support and preferences.

## Functional integrity

The screen language is inspired by the references, but the app deliberately does not pretend unsupported capabilities are live. It continues to use the established Sokoni Hub API and database model for:

- password followed by the existing server-verified four-digit PIN;
- real listings, categories, vendor/store details, images, reviews and prices;
- local cart persistence, server quote and checkout;
- real product order tracking and service-booking tracking;
- buyer account, secure session storage, password/PIN recovery, theme and support.

The existing platform does not currently provide a wallet, OTP by WhatsApp/SMS, biometric login, promo-code engine, buyer-seller escrow, instant WhatsApp checkout, merchant selling controls or automatic dispatch estimates. Those are therefore not represented as working promises in the redesigned app. They should only be added after matching backend schemas, payment/communications integrations and security design have been approved.

## Sokoni Hub 2 revision (eight reference screens)

A second set of eight references is now the visual direction: Explore, Services, My Cart, My Orders, Track Order, My Bookings, Saved Items and Profile. The pages that were not drawn (listing, store, checkout, booking form, notifications, help, legal, welcome) reuse the same layout language. The rule above still applies: take the layout from the reference, take every value from the API, and leave out anything the platform cannot back up.

### Reference element and where its real value comes from

| Reference element | Source in the app |
| --- | --- |
| Explore search, filters, city, sort, grid and list views | `useMarket` calls `GET /listings` (q, kind, category, city, min, max, sort, paging). Cities come from `GET /listings/cities`. |
| Shop by category tiles and category pills | `GET /meta/categories`, limited to categories that have listings. |
| VIP and Featured stores, labelled Sponsored | `GET /promotions`. Impressions and clicks go to `/promotions/track`. |
| "Sell on Sokoni Hub" seller count, quality guarantee banner | `GET /meta/stats`. |
| Services spotlight, rows, "Book Now" | `GET /listings?kind=service`. Seller logos come from `GET /vendors`. |
| Product and service ratings | The listing's own rating when it has reviews, otherwise its seller's rating (`ratingOf` in `src/format.ts`). Hidden when nobody has rated. |
| Cart free-delivery progress | The seller's `free_delivery_over` from `POST /orders/quote`. |
| Delivery or pick-up choice and fees | The quote's per-seller `delivery_fee`, `offers_pickup` and `offers_delivery`. |
| Orders: status, items, totals, actions | `GET /orders/mine`, with `GET /orders/track` for the details sheet. |
| Track: rider position and distance | The driver and destination coordinates returned by `GET /orders/track`. |
| Bookings: date, duration, price, address | `GET /bookings/mine` and `GET /bookings/track`. |
| Saved: current price and availability | Local favourites refreshed from `GET /listings` pages. |
| Profile: name, phone, member since, counts | `GET /auth/me`, plus the orders and bookings lists. |

### Reference elements that are intentionally not shown

The platform has no data or endpoint behind these, so the app does not draw them:

- promo-code field and discount line;
- escrow or "buyer protection" claims;
- Standard versus Express delivery (the app offers Delivery or Pick up, priced by each seller);
- delivery PIN (the order code is shown and can be shared instead);
- delivery ETA in minutes (the app shows the rider's live distance);
- driver photo and rating;
- price-drop alerts banner;
- Currency and Language rows (the app is QAR only);
- "Diaspora Member" and "Sokoni Club" labels.

Add any of these only after the matching backend fields, payment or communications integration and security review exist.

### Behaviour notes

- "Top rated" sorting runs on the phone over up to 60 results, because `GET /listings` cannot sort by rating.
- Reschedule hands the request to the seller on WhatsApp, because the API has no buyer-side reschedule endpoint (buyers can create, track and cancel bookings).
- Push notifications use the existing registration code and were not re-tested in this revision.

## Compact revision

A follow-up pass kept the same reference layouts but made the app denser and more colourful:

- **Scale.** Smaller type, tighter spacing and shorter cards (see "Compact scale" in `README.md`). The reference proportions are kept; only sizes changed.
- **Colour language.** Delivery and primary actions are green, pick-up, payment and call-to-action accents are orange, contact and account details are violet, location is rose, totals and receipts are sky. Status colours still come from the order or booking status.
- **Services tab.** The raised centre button now shows a service bell. The scissors suited only hair services, while the tab covers every kind of provider.
- **Explore category row.** The reference tiles became small round icons so ten or more categories fit in one scrolling row.
- **Order placed.** The reference set had no confirmation screen. The new one reuses the Profile header language (gradient, tinted tiles) and shows only data the API returns for the new orders.
- **Documents.** Terms, Privacy and the marketplace policy are read in the app. Share receipt produces a PDF.
- **Still not shown** (no backend data): promo codes, escrow, Express delivery, delivery PIN, ETA minutes, driver rating, price-drop alerts, Currency and Language rows.
