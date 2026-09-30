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
