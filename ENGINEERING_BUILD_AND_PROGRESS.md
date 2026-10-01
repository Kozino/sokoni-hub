# Sokoni Hub — engineering build, operations, and progress guide

> **Repository snapshot:** `main` at [`eea409b`](https://github.com/Kozino/sokoni-hub/commit/eea409b), reviewed 2026-10-01. The code history covered here contains 370 commits from 2026-09-14 through 2026-10-01. This document is a source-and-history review, not a claim that the production site, database, mail provider, or mobile store builds were exercised. No production credentials or data were accessed.
>
> **Companion:** [Complete commit / changed-file ledger](COMMIT_HISTORY.md) lists every commit in that snapshot with its first-parent changed paths. The documentation files themselves are new working-tree additions and are therefore not part of that 370-commit snapshot.

## 1. Executive summary

Sokoni Hub is a multi-vendor marketplace for discovering local **products and services**. It consists of a React web storefront and vendor/admin consoles, an Express API, PostgreSQL, object storage, and an Expo consumer app. The API is intended to be the system of record: it validates requests, enforces permissions, calculates totals, writes marketplace records and mediates storage access. Web and mobile are clients of the same API; they do not own the authoritative order, stock, booking, or settlement rules.

A key domain distinction runs through the design:

- **Products** go through a cart and checkout. One cart can be split into one order per vendor; delivery/pickup, inventory, receipts, complaints and vendor settlements apply here.
- **Services** do not go through product checkout. A buyer makes a service booking/request, the vendor agrees the time and price directly, and the platform retains the booking record. A booking is not an order and does not create a commission/payment transaction.
- **Payment is arranged outside the platform.** Current order methods include cash on delivery, WhatsApp and bank transfer. The repository contains settlement statements and payout bookkeeping, but no card gateway, escrow or automatic transfer rail.

The product evolved quickly over 17 calendar days. The feature surface is substantial, but several integration and operations details need reconciliation before treating the snapshot as release-ready. In particular, the latest public quality workflow is red at the browser legal test; email verification is not handled by the mobile registration UI; environment/domain examples disagree; and there are source-level SEO/CSP/legal-documentation conflicts. See [current verification status](#current-snapshot-verification) and [known gaps](#12-known-gaps-and-release-risks).

## 2. System architecture

```text
 Buyers / vendors / admins
      |                                 Consumer app (Expo / React Native)
      | Browser: React + Vite                         |
      +---------------------------+-------------------+
                                  | HTTPS JSON API
                                  v
                    Express / TypeScript API
                       |       |          |
                       |       |          +--> Resend or Brevo (optional email)
                       |       +-------------> Supabase Storage (public media/private KYC)
                       v
                 PostgreSQL (Supabase)

 Browser hosting: Netlify static SPA + edge functions for SEO/sitemap
 API hosting:     Render is referenced by configuration and deployment notes
```

The lines are architectural intent, not proof that those production services are currently deployed or correctly configured.

### Runtime boundaries

| Component | Responsibility | Main source/config |
|---|---|---|
| Web storefront and dashboards | Public discovery, cart, checkout UX, account flows, vendor operations and admin UI | [`web/src/App.tsx`](../web/src/App.tsx), [`web/src/pages/`](../web/src/pages/), [`web/src/components/`](../web/src/components/) |
| Web API client | Adds the API base URL; development can use Vite's `/api` proxy | [`web/src/lib/api.ts`](../web/src/lib/api.ts), [`web/vite.config.ts`](../web/vite.config.ts) |
| API | Authentication, policy checks, business rules, SQL transactions, uploads, email orchestration and JSON responses | [`api/src/server.ts`](../api/src/server.ts), [`api/src/routes/`](../api/src/routes/) |
| PostgreSQL | Durable marketplace data, constraints, security/session records, audit trail and migration ledger | [`db/schema.sql`](../db/schema.sql), [`db/migrations/`](../db/migrations/) |
| Storage | Listing images and private vendor/KYC documents via a server-side storage module | [`api/src/storage.ts`](../api/src/storage.ts), [`api/src/privateDocuments.ts`](../api/src/privateDocuments.ts) |
| Netlify edge | Crawler-facing listing/store metadata and dynamic sitemap; SPA remains the normal human response | [`web/netlify/edge-functions/`](../web/netlify/edge-functions/) |
| Mobile app | Consumer-facing account, discovery, product checkout and service-booking screens | [`mobile/App.tsx`](../mobile/App.tsx), [`mobile/src/`](../mobile/src/) |
| External mail | Optional verification, recovery, booking/order notices and billing documents | [`api/src/transactionalEmail.ts`](../api/src/transactionalEmail.ts), [`TRANSACTIONAL_EMAIL_DEPLOYMENT.md`](../TRANSACTIONAL_EMAIL_DEPLOYMENT.md) |

The browser production API URL is compiled into the web bundle as `VITE_API_URL`. Netlify edge functions separately read the runtime variable `API_URL`. Those are two different settings. Netlify hosts the SPA/edge behavior; the API is a separate service. CORS on the API must explicitly allow the deployed browser origins.

### Technology stack (snapshot)

- **Web:** React 18, React Router 7, TypeScript 5.9, Vite 8, CSS, Heroicons and selected utilities such as Recharts. Public/buyer screens use a scoped marketplace style system; vendor/admin screens have their own shells.
- **Localization:** a small in-repository dictionary/context system rather than a large i18n dependency. Buyer-facing locales are English, Arabic (RTL), French, Swahili, Twi and Luganda. Vendor and admin consoles are deliberately pinned to English/LTR. See [`web/src/i18n/index.tsx`](../web/src/i18n/index.tsx).
- **API:** Node.js 24 is the package/CI target; Express 4, TypeScript, `pg` with parameterized SQL, Zod validation, JWT/bcrypt authentication, `otpauth`, Multer/Sharp, Helmet and Express rate limiting. There is no ORM; the SQL schema and migrations are the data contract.
- **Database:** PostgreSQL, with Supabase referenced in environment examples and storage setup. Database changes are applied by the repository migration runner.
- **Mobile:** Expo SDK 57, React Native 0.86, React 19 and TypeScript 6. Auth secrets use Expo SecureStore in the client implementation. The mobile workflow builds through EAS; it is separate from the normal web/API quality job.
- **Hosting references:** Netlify for web and edge functions; Render for API. Current files contain multiple old/new domain examples, so treat those as deployment settings to reconcile, not authoritative proof of the live endpoints.

## 3. Repository map and application surfaces

| Path | What it contains |
|---|---|
| [`web/src/pages/`](../web/src/pages/) | Buyer pages, authentication, policy/support pages, vendor dashboard pages and admin pages. |
| [`web/src/components/`](../web/src/components/) | Shared layout, listing cards, forms, filters, consent and common UI. |
| [`web/src/state/`](../web/src/state/) | Auth, cart, location and toast contexts. |
| [`web/src/styles/MarketplaceTemplate.css`](../web/src/styles/MarketplaceTemplate.css) | Teal/orange public marketplace design, scoped under `.marketplace-app`; does not intentionally restyle vendor/admin shells. |
| [`web/src/i18n/`](../web/src/i18n/) | Locale dictionaries and buyer-facing direction/translation state. |
| [`web/netlify/edge-functions/`](../web/netlify/edge-functions/) | Social metadata, vendor short-link metadata and dynamic sitemap handlers. |
| [`api/src/routes/`](../api/src/routes/) | Feature routers mounted by `server.ts`. |
| [`api/src/booking/`](../api/src/booking/) | Booking availability logic. |
| [`api/src/scripts/`](../api/src/scripts/) | Migration, administrator setup/MFA, online setup and document-migration scripts. |
| [`db/`](../db/) | Baseline schema, non-numbered PIN migration and numbered migrations. |
| [`mobile/src/`](../mobile/src/) | API/provider/types and feature modules for booking, checkout, categories, promotions and UI. Much of the app/navigation is still concentrated in the large `mobile/App.tsx`. |
| [`tests/`](../tests/) | Node-based API/security/deletion/booking tests and Playwright browser tests. |
| [`scripts/restore-drill.sh`](../scripts/restore-drill.sh) | Guarded, isolated local database restore check. |
| Root `.md`, `.txt` and `.patch` files | Release notes, deployment/setup instructions, manifests and patch-era instructions; several are stale or conflict with current source (see below). |

### Web routes

The React router in [`web/src/App.tsx`](../web/src/App.tsx) separates public/buyer routes from protected vendor and administrator shells. Public routes include `/`, `/browse`, `/listing/:id`, `/store/:slug`, `/s/:slug`, `/cart`, `/checkout`, `/login`, `/register`, `/verify-email`, `/track`, `/terms`, `/privacy`, `/cookies`, `/faq`, `/policy`, `/support` and `/delete-account`. Vendor routes include listing, order, complaint, statement, booking, availability, inventory, profile and deletion areas below `/vendor`. Admin routes include vendor/listing/order/complaint/user/billing/booking/promotion/category/deletion/audit tools below `/admin`.

`Home.tsx` gets marketplace stats, categories, popular and newest listings, popular services and available cities from the API. It suppresses zero-valued hero counters, uses local category imagery, and includes separate product/service discovery. The current public design is an image-led, responsive teal/orange marketplace; the visual refresh is scoped so the dashboard shells can evolve separately.

### API route map

All application routes are mounted under `/api`; route-level details and HTTP methods live in each router file. The exact base mounts in [`api/src/server.ts`](../api/src/server.ts) are:

| Prefix / route | Responsibility |
|---|---|
| `GET /api/health` | Database reachability check; returns 503 on query failure. |
| `/api/account-deletion` | Buyer/vendor deletion request and administrator workflow. |
| `/api/auth` | Registration, login, PIN/MFA steps, session, verification and recovery. |
| `/api/vendors` | Vendor profile/public store and vendor dashboard operations. |
| `/api/listings` | Public discovery and vendor/admin listing management. |
| `POST /api/orders/checkout`, `/api/orders` | Product checkout, order management, tracking and receipt functions. |
| `/api/complaints` | Complaint intake, tracking and vendor/admin handling. |
| `/api/admin` | Administrator-only platform operations. |
| `/api/uploads` | Authenticated public-media/private-document upload and access. |
| `/api/meta` | Public metadata such as categories and marketplace statistics. |
| `/api/billing` | Statements, receipts, payout batches and guarded scheduled billing work. |
| `/api/bookings` | Service requests, availability/slot operations, cancellation, tracking and calendar export. |
| `/api/inventory` | Tracked product stock and inventory movements. |
| `/api/promotions` | Paid/featured placement records and their public display. |
| `/api/reviews` | Purchase/booking-linked reviews, moderation and vendor response operations. |

`server.ts` runs optional authentication before routers, blocks writes made through impersonated sessions, applies general and route-specific rate limits, and marks API responses `no-store`. Authentication/authorization still belongs in the API router/middleware; hiding a web route is not an API security boundary.

## 4. Core business workflows

### 4.1 Accounts and sessions

The system has buyer, vendor and administrator roles. The web client maintains an auth context; the mobile client has an auth provider and secure token storage. Login includes PIN setup/verification paths, while administrator access has TOTP/MFA and recovery controls. A session is represented in the database as well as by a signed token: the security migrations introduce session versioning/revocation and invalidate sessions on security-sensitive user changes. Administrators are intended to use the web console; the mobile app does not implement the administrator MFA completion flow.

New web registrations now require email verification. Migration 016 backfills existing accounts as verified, stores only a hash of a new one-time verification token and adds order contact email for guest notifications. A new registration response can therefore be `verification_required` with no authenticated session. This is important for the mobile mismatch described in §13.

### 4.2 Product discovery and listing governance

Listings belong to vendors and carry a `kind` (product or service), category, price/price type, location and media. Public discovery is backed by API filters and metadata rather than a static catalog. Vendor onboarding/KYC, verification and listing moderation gate publication. Geo coordinates are optional; when present they can support distance-based discovery, while city matching remains available.

Listing images are public storefront content. Commercial-registration/KYC material is treated as private vendor documentation and is served through audited access paths, not by exposing the private object bucket directly.

### 4.3 Product checkout and orders

The API—not the browser—recomputes authoritative prices, vendor grouping, delivery mode, fees and totals. Checkout is designed to:

1. Accept product items and buyer/contact/fulfilment information; reject service listings from product checkout.
2. Recompute per-vendor totals and vendor-controlled delivery/pickup rules. Clients must not be trusted to supply a fee or final total.
3. Create one order per vendor from a multi-vendor cart, preserving an item-kind snapshot and order source.
4. Use a request UUID/fingerprint-backed checkout record for idempotent retries, preventing a double-submit from creating duplicate orders.
5. Reserve tracked stock under transaction/availability guards and write inventory movement records.
6. Enforce the database invariant `orders.total = subtotal + delivery_fee`; pickup carries no delivery fee.

Vendor delivery settings include whether pickup/delivery is offered, fees, free-delivery thresholds, radius/address and instructions. There is no third-party courier integration in the active model. Order source attribution records `marketplace`, `vendor-share` or `qr`; it is for reporting, not proof that should be used to calculate a charge without additional controls.

The supported money collection methods are offline/direct-to-vendor. Settlement statements calculate the platform commission owed by the vendor in that current flow; the `funds_holder` model also anticipates a future platform-held payment path, but does not implement one. Payout/accounting tables record intent and reconciliation, not money movement.

### 4.4 Service bookings

A service booking is a separate record linked to the service listing and vendor, with buyer contact, a preferred time/note, any agreed scheduled time, an advertised-price snapshot, status and vendor notes. The booking can be requested without a logged-in buyer; contact fields are the communication source of truth. Booking states include new/contacted/confirmed/completed/cancelled/no-show.

The first booking migration intentionally created request records without vendor working hours or conflict detection. Migration 011 and the availability module add calendar slots/settings, while the UI/API support request or calendar-slot flows, Qatar-local scheduling rules, cancellation, vendor/home service selection and public reference-plus-phone tracking. Booking amounts are indicative only; bookings do not enter product order settlement or commission calculations.

### 4.5 Inventory, promotions and reviews

- **Inventory:** tracked products have stock and a movement ledger. Service listings are not stock-managed. Checkout must remain consistent with the inventory transaction.
- **Promotions:** the platform has records for featured/VIP placements and their presentation. The existence of placement records does not prove an automatic advertising payment/charge rail.
- **Reviews:** review records attach to delivered product orders or completed service bookings; visibility/moderation, vendor responses and policy switches are represented in the database/API. The code should continue to avoid implying a review is verified unless the qualifying transaction is checked server-side.

### 4.6 Billing, receipts and complaints

The billing features produce stable receipt/invoice identifiers, vendor statements, exports and payout batches. They are accounting documents and reconciliation aids. `CRON_SECRET` protects a scheduler-facing billing route; release notes indicate that scheduled billing had not been run in production, so recurring automation is not operationally verified.

Complaint/order/booking public lookups use a reference code plus phone details. The API redacts complaint tracking query strings in request logs because those values function as lookup credentials. Administrative notes and internal-only fields should remain excluded from public responses.

### 4.7 Search sharing, SEO and analytics

The web app generates vendor short links and QR imagery, captures attribution in the browser and carries it into checkout. The edge layer rewrites HTML metadata for crawler requests to listing/store pages because social crawlers do not execute the React app. The dynamic sitemap requests live public listings/vendors from the API and has static fallback URLs.

Analytics are intended to be optional: the `AnalyticsProvider` waits for consent before injecting GTM and emits explicit `sokoni_page_view` events on routes it considers public. Its current private-route exclusion covers sign-in, registration, email verification, account, deletion, vendor and admin paths; review whether `/cart` and `/checkout` should also be excluded for the intended privacy policy. Consent and third-party loading must be consistent with the actual Content Security Policy before enabling a container.

## 5. Data model and migration history

### Baseline and migration runner

[`db/schema.sql`](../db/schema.sql) is the baseline, not a complete representation of the current database by itself. The migration runner in [`api/src/scripts/migrate.ts`](../api/src/scripts/migrate.ts) applies the baseline, `db/pin-migration.sql`, then numbered files in sorted order and records SHA-256 checksums in `public.schema_migrations`. It takes a PostgreSQL advisory lock and wraps migrations/ledger entries in transactions, with special handling for the baseline's enum/transaction boundary. Once applied, a migration file is expected not to be edited; add a follow-up migration instead.

The two `002` files are distinct additive migrations: `002_delivery.sql` and `002_order_source.sql`. They sort by filename; their shared number is not a reason to skip one. For an existing database without a ledger, `--adopt-through-011` is a guarded operator procedure with schema checks. It is not a general “mark everything applied” switch: back up, validate the actual schema and follow the migration-runner comments before using it. The server refuses startup if security migration 014 is absent; production setup should apply the complete current migration set, not just satisfy that minimum readiness check.

| Migration | Main evolution |
|---|---|
| `schema.sql` | Initial users, vendors, categories, listings, orders/order items, complaints, settings and supporting constraints. |
| `pin-migration.sql` | PIN/security columns and compatibility objects; intentionally applied before numbered migrations. |
| `002_delivery.sql` | Vendor-controlled delivery/pickup settings and optional coordinates; total/fee integrity constraint; removes an unused earlier courier draft. |
| `002_order_source.sql` | Marketplace/vendor-share/QR attribution on orders. |
| `003_currency_billing.sql` | QAR defaults/labels; funds-holder and platform settings; vendor statements, statement-order links, receipt numbers and counters. Relabels USD-default rows as QAR without converting amounts, based on the documented assumption that prior amounts were already QAR. |
| `004_payouts_email.sql` | Vendor bank details, email log and payout batches. The migration explicitly notes that money still cannot move by itself. |
| `005_service_bookings.sql` | Separate service-booking records, status and request-time/contact snapshots; no money/order creation. |
| `006_inventory.sql` | Stock tracking and movement ledger. |
| `007_order_item_kind.sql` | Product/service kind snapshot on order items. |
| `008_promotions.sql` | Featured/VIP promotion records and placement support. |
| `009_reviews.sql` | Reviews, moderation/response and transaction-linked review support. |
| `010_review_policy.sql` | Review policy settings, including whether a qualifying purchase/booking is required. |
| `011_availability.sql` | Vendor booking settings, calendar availability/slots and overlap/cancellation rules. |
| `012_security.sql` | Session/security groundwork, invalidation and database privilege hardening. |
| `013_account_deletion.sql` | Account deletion request/workflow records and related controls. |
| `014_security_hardening.sql` | Impersonation audit identity, cleanup indexes and session invalidation for password/PIN/role/active/MFA changes. |
| `015_account_recovery.sql` | Account recovery support and one-time recovery data. |
| `016_transactional_email.sql` | Email verification tokens; existing-address verification backfill; guest-order contact email. |

**Operational rule:** do not replay these SQL files manually against production or assume the baseline alone is current. Take a database backup, use the documented runner and an appropriate direct/session-persistent database connection, inspect the migration ledger, and verify the deployment after each release.

## 6. Security and privacy model

Security is layered; the important controls are in API/database code, not just the web UI.

- **Database gateway:** the Express API owns application data access. SQL is parameterized. The schema/migrations revoke direct access from browser-oriented `anon`/`authenticated` roles where applicable; do not ship a Supabase service-role key to the client.
- **Authentication and sessions:** signed JWTs are tied to server-side session/version state. Password/PIN/role/active/MFA changes can invalidate sessions; admin MFA material is encrypted using `MFA_ENCRYPTION_KEY`. `PIN_PEPPER` is separate secret material. Never reuse sample keys.
- **Authorization:** buyer/vendor/admin checks occur server-side. The API has an impersonation mode for administrator support but applies a global no-write guard to impersonated requests and records the acting administrator for audit.
- **Transport/middleware:** Helmet, exact-origin CORS with credentials, `TRUST_PROXY_HOPS`, no-store API headers, general rate limiting, tighter authentication/checkout/booking/upload controls and JSON-size limits are present.
- **Inputs/errors:** Zod validation is used in route flows. Public errors are normalized rather than exposing SQL/internal details; database diagnostics are written to server logs.
- **Uploads:** image formats are constrained/processed; listing media and private vendor documents use different storage/access paths. Private document access is audited. The service-role key and bucket credentials must remain server-only.
- **Sensitive lookup data:** guest tracking codes/phones are credentials in practice. Keep them out of query-string logs and avoid placing them in analytics or referrer-bearing links.
- **Deletion:** the deletion tooling provides a controlled request/review workflow. It should not be described as immediate erasure of every financial/audit record; retention/exception handling is covered in [`docs/ACCOUNT-DELETION-RUNBOOK.md`](ACCOUNT-DELETION-RUNBOOK.md) and needs operational/legal ownership.
- **Recovery/verification:** one-time tokens are stored as hashes and expire/are consumed. If email is disabled or misconfigured, the corresponding flows are not actually delivered to users.

## 7. Local setup and development

### Prerequisites

- Node.js **24.x** for the API/web source snapshot (both package manifests require `>=24 <25`; the quality workflow uses Node 24).
- PostgreSQL for API integration and migrations. CI uses PostgreSQL 17.
- npm and Git. Mobile development additionally needs Expo tooling/device or simulator; EAS cloud builds need an Expo account/token.

> **Version conflict to resolve:** [`api/.nvmrc`](../api/.nvmrc) still says `20.18.1`, while `api/package.json`, `web/package.json` and CI require Node 24. Use Node 24 for reproducible current builds; update the `.nvmrc`/setup docs so developers do not follow the stale pin.

### API

```bash
cd api
npm ci
cp .env.example .env
# Edit .env: point DATABASE_URL at a local database; use PGSSL=false locally.
# Supply non-production JWT_SECRET, PIN_PEPPER and MFA_ENCRYPTION_KEY values.
npm run migrate
npm run dev
```

The API development server listens on port 4000 by default. The migration runner resolves the repository's `db/` directory, so run the documented npm script rather than invoking an individual SQL file. Local upload tests also need a configured storage service/bucket. Do not copy example service-role keys into any shared or production environment.

### Web

```bash
cd web
npm ci
cp .env.example .env.local
# For the local API, clear VITE_API_URL (or set it to the desired API base).
# VITE_PROXY_TARGET defaults to http://localhost:4000.
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to `VITE_PROXY_TARGET` (default `http://localhost:4000`) only when the client uses a relative API path. The checked-in web example points `VITE_API_URL` at a hosted example endpoint; clear/override it for a local backend. If a direct API URL is used, ensure its CORS allowlist includes the local web origin.

### Mobile

```bash
cd mobile
npm ci
npm run check
npx expo start
```

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` for the intended environment. There is no checked-in `mobile/.env.example`; `mobile/eas.json` currently hardcodes old Render/Netlify defaults in each EAS profile, so reconcile those before building. Do not put server secrets in `EXPO_PUBLIC_*` variables.

### Useful build/check commands

```bash
# API TypeScript build
cd api && npm ci && npm run build

# Web typecheck + production bundle
cd web && npm ci && npm run build

# Mobile typecheck
cd mobile && npm ci && npm run check
```

The repository has no single root workspace script. Install/build each package from its own directory with its own lockfile.

## 8. Configuration and deployment guide

### Important settings

| Where | Variable | Purpose / handling |
|---|---|---|
| API | `DATABASE_URL` | PostgreSQL connection. For migrations, use a direct or session-persistent connection: the migration runner holds a session-level advisory lock. Confirm the Supabase pooler mode; the sample URI uses port 6543 and should not be assumed suitable for that lock. |
| API | `PGSSL`, `PGSSL_CA` | Database TLS settings and optional provider CA. Use verified TLS for hosted databases; local test DBs may use `PGSSL=false`. |
| API | `JWT_SECRET`, `PIN_PEPPER`, `MFA_ENCRYPTION_KEY` | Separate authentication/PIN/MFA secrets. `MFA_ENCRYPTION_KEY` is 64 hex characters in the example; generate and back up securely. |
| API | `CORS_ORIGINS` | Comma-separated exact browser origins. Include the actual production custom domain and any deliberately supported admin origins; do not use a broad wildcard with credentials. |
| API | `APP_URL` | Canonical public web root for verification, booking and order links. Set explicitly to the real site URL; the fallback may choose the first CORS origin or localhost. It is referenced by current deployment docs but absent from `.env.example`. |
| API | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `SUPABASE_PRIVATE_BUCKET` | Server-side object storage configuration; separate public listing media from private vendor documents. |
| API | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO` | Optional `resend`/`brevo` provider. Example defaults to `none`, which means mail is not delivered; set and test it before enabling verification/recovery in a real launch. |
| API | `CRON_SECRET` | Required by the external scheduler for the billing cron endpoint; keep private and configure the scheduler separately. |
| API | `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops; configure to match the host so IP-based limits/logging are meaningful. |
| Web build | `VITE_API_URL` | API base compiled into the SPA. Empty/unset allows the relative `/api` development proxy; production needs the real API origin. |
| Netlify runtime | `API_URL` | API base read by the edge SEO/sitemap handlers. This is not the same as `VITE_API_URL`. |
| Netlify/build | `VITE_PUBLIC_SITE_URL` | Base URL for vendor shares/QR; otherwise code falls back to the browser origin. |
| Web build | `VITE_GTM_CONTAINER_ID` | Optional public GTM container ID. Consent must be accepted before injection; coordinate the CSP and privacy settings first. |
| EAS | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | Public mobile client endpoints; current `eas.json` values are old-domain defaults and must be replaced/confirmed per profile. |

### Suggested deployment sequence

1. **Reconcile one canonical domain/API pair.** Set public site URL, `APP_URL`, `CORS_ORIGINS`, web `VITE_API_URL`, Netlify runtime `API_URL`, mobile EAS API/web URLs and SEO constants consistently. The code currently uses `sokonihub.qa` for some canonical metadata while mobile profiles still reference older Render/Netlify names.
2. **Create a database backup and validate migration mode.** Confirm direct/session pooler behavior, current ledger and schema. Apply all migrations using the production script after a backup; verify idempotency/staging before live use. Never let the app startup minimum check substitute for applying all current migrations.
3. **Deploy API with Node 24.** Configure runtime secrets, storage, TLS, CORS and explicit `APP_URL`. `api/render.yaml` is not a usable Render Blueprint; deploy through the actual service configuration or replace the file with a valid Render specification.
4. **Deploy web on Netlify.** Build from `web/` with Node 24, `npm ci` and `npm run build`, publishing `dist/`. Set the Vite build variables and edge runtime `API_URL`. Check `netlify.toml` headers, edge routing and SPA fallback together.
5. **Set up email deliberately.** Choose Resend/Brevo, configure sender/domain/API credentials, set `APP_URL`, run verification/recovery tests and confirm delivery/log status. `EMAIL_PROVIDER=none` is not a “test email” mode; it records skipped sends and delivers nothing.
6. **Set up scheduled billing only if approved.** Supply a high-entropy `CRON_SECRET` and an external scheduler, test against staging and document that automation has not been verified in production in this review.
7. **Build mobile separately.** The GitHub EAS workflow is manual (`workflow_dispatch`), uses Node 22 and requires `EXPO_TOKEN`; it submits a cloud build without waiting. Confirm API/domain settings in each EAS profile and complete real-device smoke tests. A successful web/API workflow does not build the app.
8. **Verify and observe.** Smoke-test API health, registration+verification, buyer/vendor/admin auth, checkout idempotency, stock, booking and cancellation, receipts, email, uploads, account deletion, social previews and sitemap. Run the isolated restore drill and record its result. No production verification is claimed by this document.

### Backup/restore check

[`scripts/restore-drill.sh`](../scripts/restore-drill.sh) is intentionally restricted to two different loopback PostgreSQL URLs whose database names end in `_test`; the target must be empty. It creates a temporary protected `pg_dump`, restores without owner/ACL, compares core row counts, and checks a booking constraint and session trigger. It never drops a database. It does **not** verify production backup retention, object-storage recovery or provider-side point-in-time recovery.

Example shape (use isolated local test databases only):

```bash
SOURCE_DB='postgresql://...@127.0.0.1:5432/source_test' \
RESTORE_DB='postgresql://...@127.0.0.1:5432/restore_test' \
bash scripts/restore-drill.sh
```

## 9. CI and release checks

[`quality.yml`](../.github/workflows/quality.yml) runs on push, pull request and manual dispatch with Node 24 and PostgreSQL 17. It installs locked dependencies; builds the API; runs the production migration runner twice to check idempotency; runs security, deletion, online-setup and booking tests; builds the web app; installs Playwright Chromium; runs browser-security and browser-legal checks; then runs high-severity npm audits and verifies that package-lock files did not change.

Relevant tests include [`tests/security.mjs`](../tests/security.mjs), [`tests/deletion.mjs`](../tests/deletion.mjs), [`tests/online-setup.mjs`](../tests/online-setup.mjs), [`tests/run-bookings.mjs`](../tests/run-bookings.mjs), [`tests/browser-security.mjs`](../tests/browser-security.mjs) and [`tests/browser-legal.mjs`](../tests/browser-legal.mjs). The EAS mobile build is a separate manual workflow in [`.github/workflows/consumer-mobile-build.yml`](../.github/workflows/consumer-mobile-build.yml), not part of this quality gate.

### Current snapshot verification

The latest public **Quality and security #81** run for `eea409b` ([run details](https://github.com/Kozino/sokoni-hub/actions/runs/36863962568), run ID `36863962568`) is **failed**. GitHub's job-step listing shows API/web builds, migrations (including the repeat run), security/deletion/online-setup/booking tests and browser-security passed; step 14, `node tests/browser-legal.mjs`, failed. API/web audits and the final lockfile check were skipped because of that failure. The logs endpoint returned HTTP 403 during this review, so the exact assertion/error is unknown. Do not infer a root cause from the step name alone.

No local build/test run was performed during this review: the available runtime was Node 20.20.2, whereas the package/CI target is Node 24. No live Render, Netlify, Supabase, Resend/Brevo or EAS deployment was exercised. Historical release notes that report passing counts describe earlier commits and do not override the current failed workflow.

## 10. Progression of the product

The project history has 370 commits, but many commit subjects are generic GitHub “Add files via upload” entries. The table below groups the actual changed-file/content progression into engineering phases; the companion [commit ledger](COMMIT_HISTORY.md) is the exhaustive 370-row record with exact changed paths.

| Period | Commits | Progress |
|---|---:|---|
| **Sep 14, 2026** | 54 | Initial repository and working product foundation. Added the baseline schema, Node/Express API, route skeletons for auth/vendors/listings/orders/admin, React/Vite storefront, buyer cart/checkout, vendor/admin shells, storage integration, deployment/config files and initial brand assets. Useful anchors: [`db27656`](https://github.com/Kozino/sokoni-hub/commit/db27656), [`8f9d35b`](https://github.com/Kozino/sokoni-hub/commit/8f9d35b), [`f0e381f`](https://github.com/Kozino/sokoni-hub/commit/f0e381f), [`ea96401`](https://github.com/Kozino/sokoni-hub/commit/ea96401). |
| **Sep 15–20** | 47 | Improved cart and checkout layout/quantity controls; moved currency presentation/defaults toward QAR; separated landing, browse and listing-detail CSS; expanded listing queries/detail imagery and responsive browse UX. Anchors include [`0f1b193`](https://github.com/Kozino/sokoni-hub/commit/0f1b193), [`3dc7917`](https://github.com/Kozino/sokoni-hub/commit/3dc7917), [`602e002`](https://github.com/Kozino/sokoni-hub/commit/602e002). |
| **Sep 24** | 11 | Added vendor-managed fulfilment, delivery settings/fees, optional geo data and buyer location selection. The delivery migration makes order total/fee consistency a database invariant and clarifies that no courier network is connected. Anchor: [`2ec7a8a`](https://github.com/Kozino/sokoni-hub/commit/2ec7a8a). |
| **Sep 27** | 45 | Major commerce/domain expansion: QAR and vendor settlements/receipts; payout details/batches and email logs; distinct service-booking records; tracked inventory and order-item kind snapshots. Marketplace home also gained location, payment-method explanation and improved stats/sections. Migration anchors: [`bc5ee9f`](https://github.com/Kozino/sokoni-hub/commit/bc5ee9f), [`eccc87f`](https://github.com/Kozino/sokoni-hub/commit/eccc87f), [`d7c55f9`](https://github.com/Kozino/sokoni-hub/commit/d7c55f9). |
| **Sep 28** | 69 | Added promotions/featured placements, review records and review policy; broadened buyer localization; refined store/listing cards, filters, checkout and mobile layouts; added category imagery and Netlify social/sitemap work. Migration anchors: [`341e797`](https://github.com/Kozino/sokoni-hub/commit/341e797), [`4412174`](https://github.com/Kozino/sokoni-hub/commit/4412174), [`a026725`](https://github.com/Kozino/sokoni-hub/commit/a026725). |
| **Sep 29** | 71 | Added shareable vendor links/QR and order-source attribution; expanded vendor analytics; introduced PIN setup/reset and stronger auth/session handling; added administrator impersonation with write blocking/auditing; continued home/navigation and short-link work. Anchors include [`70341b2`](https://github.com/Kozino/sokoni-hub/commit/70341b2), [`924de7b`](https://github.com/Kozino/sokoni-hub/commit/924de7b), [`4e85b79`](https://github.com/Kozino/sokoni-hub/commit/4e85b79). |
| **Sep 30** | 47 | Added booking availability/slots, security hardening, account deletion and recovery; private-document and online-security setup work; expanded automated API/browser tests and release/runbook documentation. The consumer mobile application and manual EAS build path were merged to `main` in [`058bad6`](https://github.com/Kozino/sokoni-hub/commit/058bad6); earlier mobile source arrived in [`292c882`](https://github.com/Kozino/sokoni-hub/commit/292c882). Migration anchors include [`db6caa6`](https://github.com/Kozino/sokoni-hub/commit/db6caa6), [`1e708f7`](https://github.com/Kozino/sokoni-hub/commit/1e708f7), [`d00f8ae`](https://github.com/Kozino/sokoni-hub/commit/d00f8ae), [`ce2fc7c`](https://github.com/Kozino/sokoni-hub/commit/ce2fc7c) and [`f7c6a52`](https://github.com/Kozino/sokoni-hub/commit/f7c6a52). |
| **Oct 1** | 26 | Added transactional email and email verification (migration 016), more mobile feature screens/assets, new teal/orange marketplace styling, consent-managed GTM analytics, legal/help updates and `sokonihub.qa` SEO metadata. Sitemap moved toward live API data and robots settings were updated. Anchors include [`7869fa9`](https://github.com/Kozino/sokoni-hub/commit/7869fa9), [`44388d1`](https://github.com/Kozino/sokoni-hub/commit/44388d1), [`a7739f2`](https://github.com/Kozino/sokoni-hub/commit/a7739f2), [`28101f2`](https://github.com/Kozino/sokoni-hub/commit/28101f2), [`8b6d107`](https://github.com/Kozino/sokoni-hub/commit/8b6d107), [`40cbb98`](https://github.com/Kozino/sokoni-hub/commit/40cbb98), ending at [`eea409b`](https://github.com/Kozino/sokoni-hub/commit/eea409b). |

## 11. Documentation and configuration sources of truth

Prefer the current code, migrations and workflow over old patch-era prose. The repository has accumulated implementation notes from different snapshots; they are useful evidence of intent but not all are current runbooks.

| Document/file | Status and engineering interpretation |
|---|---|
| [`README.md`](../README.md) | Stale patch/review note describing `main @ ba19e93`, an absent `seo-landing.patch`, `sokonihub.com`, and test assets/commands not present at this head. It is not a current project quickstart. |
| [`INTEGRATION.md`](../INTEGRATION.md) | Describes share links/attribution but points to missing `PATCHES.md`, tells readers to install `qrcode`, while current `ShareStorePanel` uses an external QR image service. It also instructs users to apply steps now present in the source. Treat it as historical integration guidance until reconciled. |
| [`api/render.yaml`](../api/render.yaml) | Contains package-manifest-like JSON rather than a Render service/blueprint specification. Do not treat it as a reproducible Render deployment definition. |
| [`api/.nvmrc`](../api/.nvmrc) vs package/CI | `.nvmrc` pins Node 20.18.1; API/web manifests and CI require Node 24. Align this before onboarding/release. |
| `mobile/.env.example` | Missing, despite setup guidance referring to environment configuration. EAS profiles currently hardcode older API/web hostnames. |
| [`web/index.html`](../web/index.html) | Begins with a literal Markdown code fence (` ```html `) and contains a closing fence and explanatory prose after `</html>`. This is not valid production HTML source and may create stray document text. Remove the wrapper/prose and rerun browser tests. This is a confirmed source defect, but it is **not proven** to be the cause of the current `browser-legal` failure. |
| [`web/netlify/edge-functions/og-store.ts`](../web/netlify/edge-functions/og-store.ts) and [`vendor-og.ts`](../web/netlify/edge-functions/vendor-og.ts) | Both declare `/s/*`; they overlap the short-store route. Decide which one owns that path, remove the duplicate or assign a single explicit handler, and test crawler/human behavior after deploy. `social-preview.ts` separately covers listing/store pages. |
| [`web/netlify/edge-functions/sitemap.ts`](../web/netlify/edge-functions/sitemap.ts) | Static entries advertise `/prohibited`, while the app route is `/policy`; this likely creates a sitemap URL that resolves to the SPA not-found page. |
| [`web/netlify/edge-functions/vendor-og.ts`](../web/netlify/edge-functions/vendor-og.ts) | Has a `YOUR-API` fallback. Runtime `API_URL` must be configured; prefer one reviewed edge implementation rather than relying on fallback behavior. |
| [`GTM_ANALYTICS_SETUP.md`](../GTM_ANALYTICS_SETUP.md) vs [`web/netlify.toml`](../web/netlify.toml) | The setup guide says CSP allows GTM at `googletagmanager.com`; current `script-src` is only `'self'`. The consent provider dynamically loads the external GTM script, so the policy and guide disagree. Update CSP narrowly and verify consent/no-consent network behavior before enabling GTM. |
| [`web/src/legalConfig.ts`](../web/src/legalConfig.ts) vs [`docs/ONLINE-LEGAL-HELP-SETUP.md`](ONLINE-LEGAL-HELP-SETUP.md) / release notes | Current legal config says version `2026-10-01`, `draft: false`, while setup/release prose says policies remain drafts pending review. Operator name, Qatar CR and address fields are empty. Obtain the intended owner/legal review, fill actual operator details and align the publication flag/docs; this guide is not legal advice. |
| [`web/src/App.tsx`](../web/src/App.tsx) vs [`mobile/App.tsx`](../mobile/App.tsx) | Mobile account opens `${WEB_URL}/legal`; the web routes include `/terms`, `/privacy`, `/cookies`, `/policy` and `/support`, but no `/legal`. Correct the mobile link or add the intended combined legal route. |
| [`mobile/src/providers.tsx`](../mobile/src/providers.tsx) vs [`api/src/routes/auth.ts`](../api/src/routes/auth.ts) | API registration returns `verification_required` and no session. Mobile registration's response handler expects a token/user or PIN/setup/MFA challenge and otherwise throws “Unexpected sign-in response”; there is no mobile email-verification screen. This is a static integration mismatch, not a reproduced runtime test failure. |
| Email defaults | API example uses `EMAIL_PROVIDER=none`; the implementation logs skipped sends rather than delivering. New-user verification/recovery cannot be considered operational until an email provider and sender domain are configured and tested. |
| Domain examples | Web canonical/social metadata uses `https://sokonihub.qa`; mobile EAS profiles/config still default to old `sokoni-hub.onrender.com` and `sokoni-hub.netlify.app` values; some old docs mention `sokonihub.com`. Confirm the intended production API and web domains in every client/runtime environment. |
| Historical release/security docs | `SECURITY-RELEASE-1.md`, `ONLINE-SECURITY-SETUP.md`, `RELEASE-MANIFEST.txt`, upload instructions and older email docs represent specific earlier release states. Later migrations (012–016), current code and the latest quality workflow take precedence. |

## 12. Known gaps and release risks

The following are findings from static review or current CI evidence. “Static” means source/config evidence; it does not imply a live exploit or runtime reproduction.

### P1 — address before claiming a stable release

1. **Current CI is failing.** Obtain the browser-legal log, reproduce on Node 24, correct the underlying assertion/behavior and rerun the entire workflow. The obvious Markdown-wrapped `index.html` should be cleaned up, but do not assume it is the exact test failure without logs.
2. **Email verification is not end-to-end across clients.** Keep web verification, API response shape and mobile signup aligned. Add an integration test that registers, receives the verification-required response, verifies, then authenticates. Add a configured provider test so a skipped-send path cannot be mistaken for successful delivery.
3. **Reconcile mobile production settings and routes.** Replace old EAS API/web URLs, fix `/legal`, provide an environment example, and document the intended mobile account/MFA constraints. Test on physical iOS/Android builds; TypeScript alone is not a native release test.
4. **Resolve legal publication metadata.** Decide draft/public state, complete operator identity/registration/address fields and synchronize policy/runbook language before relying on the pages as final customer terms.
5. **Align GTM with CSP and consent.** The current policy blocks the dynamically inserted external GTM script, despite the setup doc saying it is allowed. Add only required origins and test that rejected/no consent loads no analytics. Consider whether cart/checkout page events are acceptable.
6. **Set production domains in one place per runtime.** API CORS, `APP_URL`, web `VITE_API_URL`, Netlify `API_URL`, share base URL and EAS values must agree before links/auth/SEO work reliably.

### P2 — operational consistency and maintainability

7. Resolve Node 20 `.nvmrc` versus Node 24 package/CI target. Use Node 24 in developer instructions and deployment; update the pin.
8. Use a direct/session-persistent database connection for migrations and validate any existing-ledger adoption only after backup and schema inspection. The sample 6543 URL should be checked against the required session lock semantics.
9. Remove/merge duplicate `/s/*` edge handlers, fix `/prohibited` vs `/policy`, and test SEO output against live API responses/crawler user agents.
10. Replace the invalid `api/render.yaml` with actual deploy-as-code or clearly document dashboard-based configuration.
11. Reconcile root README/INTEGRATION/email/security/release docs with current main; remove or label absent patch references and old domain/test claims.
12. Add CI/runtime observability for production API, database, mail and scheduled jobs. The repository offers logs and test scripts but no evidence here of production alerting/error tracking or a verified billing schedule.
13. Add a clear boundary around mobile feature completeness: the app currently lacks email-verification and MFA-completion paths and still concentrates substantial UI/navigation in one large `App.tsx`.

### Not verified in this review

- Whether Netlify currently accepts and executes every edge function on the intended domain, and whether the duplicate `/s/*` declaration causes a deployment/runtime conflict.
- Whether GTM or any third-party service is enabled in production, or whether site CSP differs from the checked-in config.
- Production database migration ledger/backup status, object-storage privacy policy, restore recovery, email delivery, cron schedule, Render/Netlify configuration and real-device builds.
- Exact failing assertion from `tests/browser-legal.mjs` (public action log download was blocked with HTTP 403).

## 13. Recommended next engineering sequence

1. Re-run and diagnose `Quality and security #81` with accessible logs on Node 24. Clean the invalid HTML wrapper; make the legal test pass; then confirm audits and lockfile checks actually run.
2. Align Node pin/setup files and add a fresh-clone quickstart with separate API/web/mobile commands and clear environment names.
3. Complete registration and email verification end-to-end for web and mobile; configure a staging mail provider and test recovery, booking notices and order receipts.
4. Reconcile canonical domain, CORS, `APP_URL`, Vite and Netlify runtime variables and all EAS profile values. Smoke-test direct links and `https://sokonihub.qa` routes.
5. Resolve legal policy metadata and operator details; fix mobile legal route and sitemap policy URL.
6. Resolve GTM/CSP mismatch and duplicate short-store edge handlers; add crawler/human tests for listing, store and short-link preview behavior.
7. Run migration/restore rehearsals against isolated staging databases; verify backups and private/public bucket permissions; only then run production migrations.
8. Establish operational ownership for email, `CRON_SECRET` scheduling, billing statement generation, database backups, deletion queue and production monitoring.
9. Once stable, convert this snapshot doc into a maintained architecture/runbook and update the commit ledger when new commits are added.

## 14. Source of truth and maintenance notes

For implementation questions, prioritize these in order: current route/API source and SQL migrations; package/workflow configuration; current setup docs; historical release notes/patch instructions. This document describes the `eea409b` snapshot, so it should be reviewed when the domain, auth/email model, payment rails, schema or deployment target changes.

Primary references: [`api/src/server.ts`](../api/src/server.ts), [`api/src/scripts/migrate.ts`](../api/src/scripts/migrate.ts), [`db/schema.sql`](../db/schema.sql), [`db/migrations/`](../db/migrations/), [`web/src/App.tsx`](../web/src/App.tsx), [`mobile/README.md`](../mobile/README.md), [`quality.yml`](../.github/workflows/quality.yml), and the [complete commit history](COMMIT_HISTORY.md).
