# Sokoni Hub Consumer Mobile App

A native **consumer-only** Expo / React Native TypeScript application for Sokoni Hub. It shares the production API with the web marketplace but never embeds vendor or administrator dashboards.

## Included buyer experience

- Classic three-slide, swipeable welcome experience using the established Sokoni Hub hero image and brand logo.
- Guest marketplace browsing, search, category/product/service filtering, store and listing details, related products, reviews and WhatsApp store contact.
- Local cart stored on-device, server-priced quote and checkout, all supported payment methods, and order status tracking.
- Service requests/booking, booking list and tracking.
- Buyer registration and sign-in using the existing password then PIN flow. Sessions use the platform secure keystore, not AsyncStorage.
- Password and PIN recovery screens using generic, rate-limited email-code APIs. Email delivery activates automatically when the existing Render mail provider is configured; no app rebuild is needed.
- Buyer activity, theme selection, support, legal links, and accessible light/dark Sokoni Hub themes.
- Vendor/admin accounts are explicitly routed to the secure web portal.

## URLs and secrets

This project has **no API credential, email credential, database secret, or privileged key**. `EXPO_PUBLIC_*` variables are intentionally public build-time origins only.

During rollout it uses:

- API: `https://sokoni-hub.onrender.com`
- Website/legal links: `https://sokoni-hub.netlify.app`

When custom domains are ready, set the two public variables in EAS to `https://api.sokonihub.qa` and `https://sokonihub.qa`, then build a new binary. See `.env.example`.

## Install and test

```bash
cd mobile
npm ci
npx expo start
```

A browser export can be checked without a device:

```bash
npx tsc --noEmit
CI=1 npx expo export --platform web
```

## Android APK/AAB and iOS builds

The committed `eas.json` has three safe build profiles:

```bash
npm install --global eas-cli
cd mobile
eas login
eas build:configure
eas build --platform android --profile preview       # installable APK
eas build --platform android --profile production    # Google Play AAB
eas build --platform ios --profile production        # App Store archive
```

The first `eas build:configure` creates and writes the Expo project ID after you choose the Expo account. Do not manually invent a project ID. Register `qa.sokonihub.consumer` in the relevant Google Play and Apple developer accounts (or change it to an organisation-owned reverse-DNS identifier before the first store build).

### GitHub-only cloud-build path

For a no-terminal workflow, the repository also contains `.github/workflows/consumer-mobile-build.yml`. Create an Expo access token at expo.dev and add it in GitHub **Settings → Secrets and variables → Actions** as `EXPO_TOKEN`. Then open GitHub **Actions → Consumer mobile build → Run workflow**, select:

- `android` + `preview` for an installable internal APK;
- `android` + `production` for a Google Play AAB; or
- `ios` + `simulator` for a Mac-only iOS Simulator app (no Apple Developer account is needed);
- `ios` + `production` for an iOS cloud archive.

The workflow links the Expo project on its first run and EAS displays the build URL in the action log. The token is only an Actions secret; never add it to app source or an Expo public variable.

## Required production sequence

The app calls the recovery routes included in the repository change:

- `POST /api/auth/recovery/request`
- `POST /api/auth/recovery/complete`

Before deploying this API change, apply `db/migrations/015_account_recovery.sql` through the existing GitHub **Online security setup** workflow (`migrate` action), using the same established migration confirmation procedure. The migration is additive and does not store recovery codes in plaintext.

Set one existing supported mail provider on Render when recovery email should go live:

- `EMAIL_PROVIDER=resend` or `brevo`
- `EMAIL_API_KEY`
- verified `EMAIL_FROM`
- optional `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`

Never add those values to this app, GitHub source, or an `EXPO_PUBLIC_*` variable.

## Release checks

1. Add Android App Links and iOS Universal Links after the `sokonihub.qa` domains are live.
2. Set stable public Terms, Privacy and support URLs under the custom domain.
3. Verify the mail sender domain and send a real password and PIN recovery email.
4. Use an AAB for Google Play distribution; an APK is only for internal/preview installation.
5. Run `npm audit` during dependency upgrades. Expo SDK dependencies currently report transitive advisories; use Expo's supported updates rather than forced major upgrades.

## Mobile QA pass (orders, bookings, Android layout, explore)

- **Orders now place.** The app sent an `attribution` object the API rejects (`ref` + `vendorSlug` only), so every checkout failed validation. It is no longer sent. Collection-only orders send a clear address placeholder, retries reuse one idempotency key, and a confirmation screen lists each order with WhatsApp and Track actions. Code: `src/checkout.tsx`.
- **Bookings use real date and time selection.** `src/booking.tsx` reads `GET /bookings/slots`: calendar vendors show a date strip and live free times (sent as `slot_start`); request-only vendors show a date strip and start times (sent as `preferred_at`, Qatar time). At-provider / at-home options, home address, and a confirmation screen follow the vendor's settings.
- **Android safe areas.** `react-native-safe-area-context` pads the top (status bar) so back arrows and the notification bell are visible, and the bottom tab bar / cart / checkout / detail action bars clear the gesture bar. Hardware back now steps through screens.
- **Search and filters.** The search box no longer unmounts while results load, is debounced, and filters (type, category, sort, price, seller city) persist when you return from a listing. Results are paged (20 at a time) with pull-to-refresh.
- **VIP and sponsored stores** appear on Explore from `GET /promotions` (always labelled Sponsored; impressions and clicks tracked through `/promotions/track`).
- Also: saved items (heart), a notifications screen built from order/booking status, sign-in returns you to where you were.

No API or database change is required.

## Sokoni Hub 2 interface (design system)

The buyer app was restyled to the "Sokoni Hub 2" reference designs: lavender canvas, emerald headers, orange action colour, white rounded cards, a raised orange Services button in the bottom bar, and a dark theme that follows the same palette. Type, spacing and card sizes follow a compact scale (see below), and every screen adapts from small Android phones to iPads. **Only the presentation layer changed.** The API, database, cart and checkout payloads, authentication and navigation model are the ones described above. Every name, price, image, rating, date and status on screen is read from the API. When the API has no value for something, that row is hidden rather than filled with placeholder content.

### Where things live

| File | Purpose |
| --- | --- |
| `src/providers.tsx` | Light and dark colour palette (`primary`, `deep`, `orange`, `brown`, `lav2`, `onPrimary`, ...), theme, cart and auth providers. Change colours here only. |
| `src/kit.tsx` | Layout building blocks: `AppBar`, `Tabs`, `PageTitle`, `SubBar`, `SearchBar`, `PillRow`, `SegTabs`, `Pill` / `StatusPill` (`orderLook` and `bookingLook` turn API statuses into a label, icon and colour), `RatingChip`, `Price`, `QtyStepper`, `SortPill`, `ViewToggle`, `ModeCard`, `SectionHead`, `TrustBanner`, `InfoLine`, `Skeleton`, `Panel`, `Thumb`, `Avatar`, and `Screen` (centres the app in a 640 px column on wide displays). |
| `src/cards.tsx` | `ProductCard`, `ProductRow`, `ServiceRow`, `ServiceSpotlight`, `CategoryTile`, `SellCard`, `VendorChip`, `HeartButton`, `useQuickAdd`. |
| `src/data.ts` | React Query hooks for server data: `useCategories`, `useActiveCategories`, `useStats`, `useCityList`, `useVendorDirectory`, `usePromoSet`, `useMyOrders`, `useMyBookings`, `useOrderDetail`, `useBookingDetail`, `useCartQuote`, and `useMarket` (paged, debounced search with filters and sorting). It also remembers listing thumbnails so order lists can show product pictures. |
| `src/format.ts` | Qatar-time (UTC+3) dates and times, QAR formatting, phone and WhatsApp helpers, distance labels, `ratingOf`. |
| `src/type.ts` | `scaleFont()`, the compact type scale used for sizes computed at run time (prices, initials). Written sizes in style sheets are already final. |
| `src/checkoutDraft.ts` | Remembers the buyer's last delivery mode, address, map pin and note. |
| `src/orderPlaced.tsx` | The "Order placed" confirmation: gradient hero, stat tiles, one card per seller order, and a "what happens next" timeline. |
| `src/legal.tsx`, `src/legalText.ts` | The in-app Terms of use, Privacy policy and Marketplace policy reader. `legalText.ts` holds the website's wording (see "Legal pages" below). |
| `scripts/convert_legal.py` | Regenerates `src/legalText.ts` from the website's legal pages. |
| `src/receipt.ts`, `src/receiptShare.ts`, `src/receiptLogo.ts` | PDF order receipt: the HTML template, the create-and-share step, and the embedded logo. |
| `src/toast.ts`, `src/nav.ts` | The one shared toast context, and the shared navigation prop types. |
| `src/screens/*.tsx` | One file per screen (see below). |
| `assets/logo-mark.png` | The bag symbol cropped from `logo.png`, used in the app bar, sign-in and welcome screens. |

### Screens

Explore, Categories, Services, Cart, Checkout, Orders, Track, Bookings, Book a service, Saved, Profile, Listing, Store, Notifications, Help and support, Terms and privacy, Welcome, and the sign-in, registration, PIN and recovery screens (restyled with the same primitives). The Track screen draws the rider on a live map on iOS and Android (`TrackMap.tsx`); the web build shows a simple placeholder with the coordinates (`TrackMap.web.tsx`).

### Compact scale

Sizes were reduced across the app so more fits on each screen. Use these values for new work:

| Element | Size |
| --- | --- |
| Page title | 19 |
| Section title | 15 |
| Card title / row title | 12 to 13 |
| Body and captions | 10.5 to 12.5 |
| Buttons | 12 to 13, 40 to 44 high (small 30 to 34) |
| Prices | 17 to 22 |
| Inputs | 14, 44 high |
| Screen side padding | 12 |
| Card radius | 14 to 16 |

Icons render at 90% of the size passed to `Icon`. Fonts are Inter 400, 600, 700 and 800 only, so use weights 600 and 700 for emphasis. The system text-size setting is respected up to 1.25x.

### Screen sizes

- Phones use the full width. Tablets and large screens get a centred column: 720 px for most screens and 960 px for the browsing screens (`<Screen wide>`).
- Product grids use `useGrid(minCard)` from `src/kit.tsx`. It returns the number of columns and the card width for the current column, so a grid is 2 columns on phones, 3 to 5 on tablets, and never leaves a half card.
- The VIP and Featured rails show two full cards at any width (three on tablets), snap card by card, and never show a cut-off card. With fewer stores than slots the cards stretch to fill the row.
- Sticky bars above the tab bar use `TAB_LIFT` and `useTabHeight()` from `src/kit.tsx` instead of fixed numbers.

### Colour

Beyond the emerald and orange brand colours the palette has violet, sky, rose and amber accents (with dark-mode versions) and `heroA/B/C`, the deep greens used under white text in both themes. `accentAt(colors, index)` hands out the accents in a repeating order, and `Panel accent={...}` adds a coloured edge strip. Status colours come from `orderLook` and `bookingLook`.

### Legal pages

Terms of use, Privacy policy and Marketplace policy open inside the app (Profile, Help & support and the sign-up link all lead to them). The wording is the website's own text. `src/legalText.ts` is generated from `web/src/pages/Legal.tsx`, `web/src/pages/Static.tsx` (Policy) and `web/src/legalConfig.ts`. When those pages change, regenerate it with `python3 mobile/scripts/convert_legal.py` (run from the repository root; needs Python 3 and Node) so the app and website agree. The only deliberate difference is the analytics paragraph, which states what the app itself does.

### PDF receipts

"Share receipt" in the order details creates a branded A4 PDF (order, seller, buyer, items, totals, payment status, support contacts) and opens the share sheet, so it can go to WhatsApp, Mail, Files or AirDrop. It uses `expo-print`, `expo-sharing` and `expo-file-system`, which were added to `package.json`. They are native modules: **make a new EAS build** (Expo Go already includes them). On the web preview the button opens the browser's print dialog. `buildReceiptHtml()` in `src/receipt.ts` has no native dependencies, so the layout can be previewed in any browser.

### Conventions for new screens

1. Wrap the screen in `Screen`. Screens reached from the tab bar put `AppBar` at the top and `Tabs` at the bottom, and sub-pages add a `PageTitle` (title, subtitle and back arrow). Immersive pages (Listing, Store, Help and support) draw their own header.
2. Fetch data with a hook from `src/data.ts` (add one there if needed). Do not copy sample data into a screen.
3. Take colours from `useTheme().colors` so dark mode works. Avoid hex literals for text and surfaces.
4. Read optional API fields defensively and hide the row when empty (see `cleanCity`, `ratingOf`, `durationLabel` in `src/format.ts`).
5. Show toasts with `useToast()` from `src/toast.ts`. Do not create another `ToastContext`.
6. Lay grids out with `useGrid()` and use `<Screen wide>` for browsing screens, so tablets get more columns instead of stretched cards.
7. Stay on the compact scale above and take accent colours from `accentAt()`.

### Checks

```bash
cd mobile
npx tsc --noEmit                       # must stay clean
CI=1 npx expo export --platform web    # smoke-test the bundle without a device
```

## Mobile QA pass 2 (interface refresh)

Fixes made while moving the app to the new interface. No API or database change is required.

- **Toasts now appear.** Each screen file had its own private `ToastContext`, so "added to cart" messages never reached the provider. There is now one shared `src/toast.ts`, and the cart toast carries a "View cart" action.
- **Products with sizes can be ordered.** Quote and checkout requests did not send the chosen `option`, which the API rejects for products that have options. It is sent now, and cart lines are keyed by `listing_id::option`, so two sizes of one product stay separate. The quick "+" on a card opens the listing instead when a size must be chosen.
- **Track an order in one step.** Opening Track from Orders loads the order straight away, using the order's own `contact_phone`, instead of asking for a manual "Track status" tap.
- **Cleaner filters.** Any category whose name contains "(BANNED)" is hidden, and categories with no listings are hidden while the whole catalogue fits in one page (60 listings). Cities that differ only by trailing spaces ("Doha" and "Doha ") are merged, and the city filter matches them all.
- **Consistent backgrounds.** The navigator now uses the app palette, which removes the grey background on older screens and fixes dark mode.
- **Brand mark.** The sign-in and header logos showed a cropped wordmark; they now use the symbol.
- **Support and legal links.** "Customer website" opened vendor legal text; it now opens the website. Terms, Privacy and Customer policy open the matching pages.
- **Listing page.** The "More to explore" rail was blank. The page now has the gallery with dots, size options, quantity, seller and related rails, a review summary with eligibility-aware "write a review", and WhatsApp contact.
- **Saved items stay current.** Saved listings are refreshed against the live catalogue, and listings that were removed are flagged.
- **Orders and bookings have real actions.** Reorder, Review, Details with a shareable receipt, Add to calendar, Cancel, and Reschedule through WhatsApp.

## Mobile QA pass 3 (compact interface)

- **Smaller type and spacing everywhere.** Font sizes, weights, card padding, button and input heights, icon sizes and corner radii follow the compact scale. The market grid fits about a quarter more rows per screen (one row went from about 308 to 241 px), and Orders and Bookings cards are 12 to 16% shorter. Page titles went from 29 to 19, section titles from 20 to 15 and card titles from 16 to 12.
- **Explore.** "Shop by category" is a scrolling row of small round category icons with small labels. Product tiles are shorter and use a small cart button instead of "+". The VIP and Featured rails show two complete cards at every screen width.
- **Services.** The banner is a slim strip, the spotlight card is much smaller, and the Book buttons are compact.
- **Order placed page.** A colourful confirmation with an animated check, order code with share, Track and WhatsApp actions, and a "what happens next" timeline.
- **Cart, Checkout, Notifications, Support, Saved.** Compact and colour-coded; Notifications has a colourful background and a status-coloured list.
- **Terms and Privacy open in the app** instead of redirecting to the website.
- **Share receipt creates a PDF** instead of sharing text.
- **New Services icon.** The scissors were replaced with a service bell in the tab bar and in every image placeholder.
- **Screen sizes.** Layouts were checked at 360, 400, 768 and 1024 px wide, in light and dark mode. Tablets get wider grids and two-up list rows.
- **Dark mode.** Hero gradients stay deep green so white text is always readable.
