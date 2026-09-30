# Sokoni — Security Release 1

**30 September 2026 · Base commit `f2bd114` · Staged implementation**

> **Online-only setup:** If you cannot use a terminal, use `sokoni-security-release-1-online.zip` and follow `ONLINE-SECURITY-SETUP.md` instead of the command-line deployment instructions below. The online workflow performs migration and first administrator MFA enrollment through GitHub Actions.

## Read this before deploying

This is a **tested source-code release**, not a change already deployed to your hosting accounts. Deploy the API, website and migration together in a maintenance window. Do not upload only the frontend or only the backend.

**All old sessions are intentionally invalidated. Every administrator must be enrolled in MFA before logging in.** Existing public ID documents are NOT made private merely by deploying this release.

The project remains backed by your existing PostgreSQL/Supabase schemas and Express API. No production credentials were used, no production data was changed and no paid service was provisioned.

## Delivered in this release

- Persisted, revocable sessions; current/other-session management at `/account`.
- Password/PIN resets, role changes and account disablement revoke old sessions. Re-enabling an account does not revive them. PIN intermediate tokens are version-bound too.
- Mandatory administrator authenticator MFA, replay protection and one-use recovery codes. Initial enrollment/recovery is an operator command, not an unauthenticated web endpoint.
- Administrator impersonation depends on the administrator's still-valid parent session.
- Fail-closed production secret validation; exact configured CORS origins; verified database TLS; database query/connection timeouts.
- Atomic product checkout, race-safe stock deduction, request idempotency, allowed order transitions and exactly-once stock restoration on unfulfilled cancellation.
- Public listing allowlists exclude supplier notes; category bans apply to detail/storefront/cart and booking creation/slot lookup.
- Complaint lookup requires the signed-in reporter or code + full phone. Staff notes are not returned by guest/vendor complaint views. Newly generated reference codes use cryptographic randomness. Legacy short codes retain phone protection.
- Private KYC image uploads; checked private bucket; owner/admin signed reads; no arbitrary/public KYC links accepted for new submissions. A legacy-image migration utility is included.
- Actual image decoding/re-encoding, size/pixel/count limits, daily per-account upload cap, shared database-backed endpoint/account limits. **PDF uploads are deliberately disabled.** Use a clear JPEG/PNG/WebP ID image.
- Sanitised health/errors; query-string redaction; frontend frame/CSP baseline and CSP report-only policy for further tuning.
- Versioned, checksummed, locked migration runner with explicit adoption of existing databases.
- API/web runtime target Node 24; upgraded Multer, Vite, React Router and supporting packages.
- GitHub Actions build/migration/API/browser checks and Dependabot configuration.
- Signed-in booking history at `/account`, alongside the existing order history. Guest tracking remains. Guest records are not silently claimed by matching a phone number.
- Isolated database restore-drill script.

## Scope still pending — not hidden behind placeholders

| Requested next item | State after this release |
|---|---|
| Automated tests / deployment checks | Implemented in repository files; GitHub execution requires pushing them and enabling branch protection. |
| Versioned migrations | Implemented; fresh install, rerun and existing-database adoption tested locally. |
| Secure password recovery and device/session management | Session management implemented. Email verification/password recovery is **next stage**. Existing operator PIN-reset workflow remains. |
| Booking confirmation/cancellation emails with retries/status | **Next stage.** Existing optional billing/receipt mailer is unchanged. No new booking-email queue is claimed. |
| Configurable pending-booking expiry | **Next stage.** Current pending holds still require handling/cancellation. |
| Optional buyer booking/order history | Implemented for signed-in transactions. Guest access preserved; secure guest-account claiming is not implemented. |
| Monitoring, alerts, tested backup restoration | Health sanitisation and an isolated DB restore drill completed. Hosted monitoring, alert delivery, production backup verification and storage recovery still require configuration/work. |

Buying a domain alone does not activate email: configure a provider, verified sender and required DNS records as well. Keep `EMAIL_PROVIDER=none` for now. No WhatsApp API integration was added.

## Deployment sequence

### 1. Back up and prepare a staging copy

- Back up your database and private/public Storage objects separately. Database dumps alone do not contain uploaded files.
- Preserve the current source revision, deployment settings, JWT/PIN secrets and recovery details securely. Do not put secrets in GitHub files or frontend variables.
- Rehearse this rollout against a staging database copy. Reconcile any **historical overselling** or manual stock corrections; this release prevents future races but does not reconstruct old inventory.
- Confirm Express connects as the table owner or an appropriately privileged server role. Migration 012 removes anonymous/authenticated Supabase table/view grants and enables RLS for the named Sokoni tables. This architecture routes application access through Express, not directly through the browser Supabase Data API. Test any separate integrations before revoking their access.

### 2. Environment and runtime

Use **Node 24** on Render/build machines. Netlify's configuration now targets Node 24.

Set API environment variables in the hosting dashboard, not in code:

| Variable | Required setting |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Actual database URI; URL-encode password characters. |
| `PGSSL` | `true` in production. |
| `PGSSL_CA` | Trusted provider CA PEM if needed; literal `\n` line breaks supported. Never restore `rejectUnauthorized:false`. |
| `JWT_SECRET` | At least 32 random characters; no development/default placeholder. |
| `PIN_PEPPER` | Preserve your existing strong pepper. Changing it makes existing PIN hashes unusable. |
| `MFA_ENCRYPTION_KEY` | Independent **64-character hex key**. Back it up securely; encrypted MFA seeds depend on it. |
| `CORS_ORIGINS` | Exact HTTPS website origins, comma-separated, no trailing slash or wildcard. Your existing Netlify URL works without buying a domain. |
| `TRUST_PROXY_HOPS` | Set to the actual trusted reverse-proxy topology. Default is 1, not a guarantee for every deployment. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix secrets with `VITE_`. |
| `SUPABASE_BUCKET` | Existing public listing-image bucket. |
| `SUPABASE_PRIVATE_BUCKET` | Separate **private** bucket, e.g. `vendor-documents`. |
| `EMAIL_PROVIDER` | `none` until intentionally configured. |

Generate each new secret separately using `openssl rand -hex 32`. Do not copy fixture secrets from tests/workflows into production. Do not rotate the existing PIN pepper as a routine deployment step.

Keep the frontend `VITE_API_URL` pointing to the actual Render API, or retain your existing configured proxy. No purchased domain is required for these changes.

### 3. Build and migrate

From the repository root:

```bash
cd api
npm ci
npm run build
```

Use a **direct database connection or session pooler** for migration execution—not a transaction-pooling connection—because the runner holds a session-level advisory lock.

For your current existing database, after confirming all historical migrations through 011 and `db/pin-migration.sql` are already present:

```bash
npm run migrate:prod -- --adopt-through-011
```

This records the legacy files in a checksum ledger **without replaying their historical data updates**, then applies migration 012. Adoption is explicit and includes representative readiness checks; it is not a substitute for verifying the database's migration history. If checks fail, stop and investigate—do not remove the guards.

For a genuinely empty database:

```bash
npm run migrate:prod
```

For subsequent releases:

```bash
npm run migrate:prod
```

Applied-file checksum mismatches stop deployment. Add new migration files rather than editing applied ones. The API will refuse startup if migration 012 is not recorded.

**Note:** the pre-existing `api/render.yaml` is not a valid Render Blueprint. Continue using your existing manually configured Render service/build settings; do not use that file to provision a new service.

### 4. Enroll administrators before reopening access

With the same database and `MFA_ENCRYPTION_KEY` configured, run from `api` in a **private operator terminal**:

```bash
npm run admin:mfa:prod -- admin@example.com --confirm-reset
```

The identifier may also be the exact stored admin phone number. This outputs an authenticator setup secret/URI and ten recovery codes once. Add the secret to an authenticator app and store recovery codes offline. Never run this command in public CI/build logs or share its output.

The command can reset lost MFA, but requires trusted database/operator access and revokes that administrator's previous sessions. There is no password-only administrator bypass.

### 5. Configure and migrate identity documents

Create `vendor-documents` as a **private** Supabase bucket. Do not turn the listing-image bucket private unless you intentionally redesign image delivery.

First inspect the legacy migration without changing anything:

```bash
npm run documents:migrate:prod
```

After backup and review:

```bash
npm run documents:migrate:prod -- --apply
```

The utility accepts only images in the configured public bucket under the matching user's key prefix. It creates a private image, updates the vendor reference, and requests deletion of the old public object. External URLs, PDFs, corrupt images and shared references are flagged for manual review/re-upload.

**Important operational limits:** this utility compiled successfully but was not run against your live bucket. A crash or deletion failure after the vendor reference changes requires manual reconciliation against your backup/Storage listing. Verify every old public URL is inaccessible at the origin and address cached/CDN copies with the provider. Do not declare old documents secured merely because the utility exited or the UI now displays a private reference.

The admin/vendor UI refuses to present legacy public ID links as if they were private. New uploads require actual JPEG/PNG/WebP contents, not just a claimed MIME type. Private signed URLs expire after 60 seconds but an authorised viewer can still save a copy; expiry does not erase downloaded files.

### 6. Deploy both applications and smoke-test

Deploy the API and frontend together. Old sessions and stale checkout pages must be refreshed. New checkout requires `request_id`; the updated website maintains it across retries. Old clients will receive validation errors instead of unprotected checkout.

Verify:

- Admin password → authenticator step → admin dashboard.
- Buyer/vendor login/PIN setup, password/PIN change and logout.
- `/account` session list, revoke other sessions, booking/order history.
- Storefront/listing images and no supplier notes in public JSON.
- New private ID upload; other-user denial; authorised admin review.
- Two simultaneous purchases of the last unit: only one new order.
- Retry with the same checkout request: same order; cancellation restores once.
- Existing booking flows, guest tracking and complaint code + full-phone lookup.
- Direct anonymous Supabase access to sensitive records fails.
- HTTPS, actual response headers, exact allowed origin and API/database availability.

Do not blindly roll back to the old password-only/session implementation if something fails. Keep a maintenance window and diagnose; a rollback can reopen the original vulnerabilities. Additive schema generally remains, but code/data rollback must be reviewed and tested.

## Tests and CI

Run only against isolated local databases whose names end in `_test`.

```bash
# Export DATABASE_URL, PGSSL=false and test-only JWT_SECRET/PIN_PEPPER/MFA_ENCRYPTION_KEY.
cd api
npm ci
npm run build
npm run migrate:prod
npm run test:security
npm run test:bookings
cd ../web
npm ci
npm run build
npx playwright install --with-deps chromium
cd ..
node tests/browser-security.mjs
```

Observed in this workspace:

- **62 security/commerce integration checks passed** using real PostgreSQL and the actual API. Storage HTTP responses were served by a local stub; live Supabase permissions and Storage were not tested.
- **34 booking API/PostgreSQL checks passed** on the updated source.
- **5 browser checks passed:** real MFA sign-in/external redirect rejection, session revocation, booking-history render, mobile containment and no uncaught JavaScript errors.
- API and frontend production builds passed with Node 24. The large frontend bundle warning remains a performance follow-up.
- API and web full dependency audits reported **0 known advisories** at testing time. This is not a guarantee against undisclosed flaws.
- Fresh migration, safe rerun and explicit existing-database adoption tested.
- An isolated anonymous database role could not read `users`.
- An isolated dump/restore preserved tested row counts, booking exclusion constraint and session-invalidation trigger.

The workflow file is `.github/workflows/quality.yml`. Enable required checks and branch protection on GitHub after pushing it. The presence of a workflow file does not mean a GitHub-hosted run has already passed.

## Backups and operations

`scripts/restore-drill.sh` deliberately accepts only two different local `_test` database URLs and an empty restore target. It never drops a database:

```bash
SOURCE_DB='postgresql://...@127.0.0.1/source_test' \
RESTORE_DB='postgresql://...@127.0.0.1/restore_test' \
scripts/restore-drill.sh
```

Use matching PostgreSQL client versions. This checks database recovery mechanics, not your provider's production backup/PITR configuration, uploaded files, DNS or secret recovery.

Configure a hosted uptime check on `/api/health`, error alerts, storage/bandwidth budgets and provider account MFA. Keep backups access-controlled and periodically rehearse restoration into an isolated environment. Review retention for sessions, rate-limit records, audit logs, checkout replay records and uploaded IDs. Do not delete checkout idempotency records casually: deleting a key can allow a very late retry to create another order.

Production alert delivery, automatic booking email retries, password recovery and pending-hold expiry are intentionally left for the next implementation stage rather than represented as working features here.

## Applying the delivered files to GitHub

This release was committed locally on `security-foundation-release-1`. A GitHub push was attempted but blocked because this workspace has no GitHub authentication. **No remote commit, pull request or hosted CI run is claimed.**

The ZIP is an overlay of the changed/new files, not a complete independent repository. Apply it to the latest compatible checkout based on `f2bd114`. Include the hidden `.github` directory and `.gitignore`. Do not upload `node_modules`, local `.env` files or build outputs.

Alternatively, from your repository checkout:

```bash
git switch -c security-foundation-release-1
git apply --check /path/to/sokoni-security-release-1.patch
git apply /path/to/sokoni-security-release-1.patch
git add .
git commit -m "Security foundation: auth, private documents, checkout, migrations and CI"
git push -u origin security-foundation-release-1
```

Open a pull request, wait for the quality checks, rehearse the database/private-storage/MFA steps above, and only then merge/deploy. If the patch check fails because your source changed, do not force it; reconcile against the newer code first.
