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
