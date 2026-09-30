# Deploy the footer, legal/help pages and reviewed account deletion

**Browser-only instructions — no Bash or terminal required.**

Based on repository `Kozino/sokoni-hub`, main commit **9cec15d38b1ce73249443ffc64d1424b6e479826**, rechecked during preparation. This package contains changed/new files only. It is **not** a replacement for the entire repository.

Your existing MFA setup is working. **Do not regenerate your seed, re-enrol MFA, change the MFA encryption key, or choose the `enroll` maintenance task for this release.** Email remains unconfigured. No backup step is included, as requested for your test-only Supabase data. Completed account/file deletion is nevertheless irreversible: use disposable test accounts for acceptance testing.

## What is included

| Footer destination | Implementation |
|---|---|
| `/terms` | English draft Terms, operator placeholders and publication checklist |
| `/privacy` | English draft Privacy Policy covering actual account/CR/transaction/location data and outstanding operational details |
| `/support` | Existing support/complaint form and tracking reused, with WhatsApp **+974 6604 6431**; no invented email |
| `/faq` | English marketplace, CR-verification, booking, payments and deletion FAQs |
| `/delete-account` | Authenticated request, password confirmation, withdrawal before processing, downloadable private receipt and status tracking without login |
| `/admin/deletion` | Admin review, blocker checks, documented retention decision and reviewed completion/retry |

The footer also appears on vendor/admin dashboard layouts. Registration, checkout and vendor-profile/onboarding screens link to the draft privacy information. Verification wording now asks for **CR/business-registration licences, not personal ID**; existing database field names, private bucket and `kyc://` references are preserved.

## 1. Prepare the release without restarting the live API prematurely

1. In Render, open the existing API service → Settings → automatic deploy controls, and temporarily turn off automatic deployment. The new API refuses startup until migration **013** is recorded.
2. If your frontend host has automatic production deployment enabled, pause it too where your project controls permit. Otherwise use a maintenance/testing window: the new deletion page must not be announced for use until the migration and new API are deployed.
3. Download and extract `sokoni-legal-help-release.zip` on your computer. These are normal source folders, not commands.
4. If the GitHub main branch has changed beyond the base above, review differences before overwriting affected files. Do not replace newer work blindly.

## 2. Upload the changes through GitHub

1. Open **Kozino/sokoni-hub** on GitHub and select your default branch.
2. **Add file → Upload files.** Upload the extracted `api`, `db`, `web`, `tests` and `docs` folder contents, preserving their paths. Confirm the upload list shows paths such as `api/src/routes/deletion.ts`, not an extra outer ZIP-name folder.
3. Existing paths are replacements; new paths are additions. **Do not delete existing folders/files** that are absent from this incremental ZIP. Do not upload build folders, node_modules or credentials.
4. Include `.github/workflows/quality.yml`. If your file browser hides `.github`, navigate to that file directly on GitHub → pencil/Edit and replace it with the supplied version, then commit. The updated workflow runs the new deletion and legal-browser suites alongside existing tests.
5. Commit with a message such as **Add draft legal pages and reviewed account deletion**. If using a branch/pull request, merge after the checks pass; the maintenance workflow runs only on the default branch.
6. Open **Actions → Quality and security**. Wait for a green run on the final commit. It uses an isolated GitHub PostgreSQL service, **not your Supabase database**. A workflow-file-only follow-up commit may run checks again.

Important new files include `db/migrations/013_account_deletion.sql`, `api/src/routes/deletion.ts`, `web/src/legalConfig.ts`, legal/deletion frontend pages, two tests and these docs. **No old migration was edited. No dependency lockfile update is needed.**

## 3. Apply migration 013 using the existing online workflow

Use the **Online security setup** workflow already in the repository. Do not paste migration 013 alone into SQL Editor: the migration ledger/checksum must be recorded by the runner.

1. In GitHub → Settings → Secrets and variables → Actions (or your existing `production-maintenance` environment), restore the maintenance database secrets if you removed them after MFA setup:
   - `MAINTENANCE_DATABASE_URL`: your valid Supabase direct/session-pooler PostgreSQL connection string. Use the working **session pooler on port 5432** where IPv4 connectivity is needed, not transaction-pooler port 6543. Use the real password in the secret, URL-encoded if needed.
   - `PGSSL_CA`: the same verified Supabase CA certificate if your connection requires it. Keep the full PEM including BEGIN/END lines.
2. **No administrator seed, recovery-code or identifier secret is needed to apply this migration.** Do not change your Render runtime secrets. The existing workflow may reference unused enrolment secrets; do not recreate them for this release.
3. Actions → **Online security setup → Run workflow** on the default branch.
4. Choose task **`migrate`**. Its existing confirmation field still requires exactly:

   `I VERIFIED MIGRATIONS THROUGH 011 AND PIN`

   This is the workflow's existing guard, not an instruction to rerun/rewrite old migrations. Your working security release already has the ledger through 012; the runner validates those checksums and applies only new 013.
5. Approve the `production-maintenance` environment if prompted.
6. Open the job → **Run selected maintenance task**. Expected messages include:
   - `Already applied: migrations/012_security.sql`
   - `Applying: migrations/013_account_deletion.sql` (or `Already applied` on a rerun)
   - `Migration ledger is up to date.`
   - `Online database migration completed.`
7. If the task fails, **stop before deploying the new API**. Do not force ledger entries, disable TLS verification or edit an already-applied historical migration.

Optional read-only confirmation in Supabase → SQL Editor:

```sql
select name, applied_at
from public.schema_migrations
where name = 'migrations/013_account_deletion.sql';

select to_regclass('public.account_deletion_requests') as deletion_table;
```

The first query must return one row and the second must return the new table. No existing account is deleted by applying migration 013.

## 4. Deploy the API, then the frontend

1. Render → existing API → **Manual Deploy → Deploy latest commit**. Keep the working database/TLS/CORS/JWT/PIN/MFA/Storage settings. Keep **Node 24** and `EMAIL_PROVIDER=none` as in the security release.
2. Confirm the API starts normally. Its startup guard now requires migration 013. Check your existing `/api/health` endpoint returns `{"ok":true}`.
3. Storage deletion uses the existing server-only Supabase service-role key, configured private bucket and public listing bucket. **Never put the service-role key in frontend/Vercel `VITE_` variables.** The deletion API must have permission to remove the correct objects.
4. Deploy the frontend from the **same new GitHub commit**. If using Vercel, create/trigger a deployment of the latest branch/commit through the dashboard/Git integration. A “Redeploy” of an old deployment can rebuild the old commit, so check the source commit explicitly.
5. Keep the existing frontend API URL and SPA route rewrites. Directly opening `/terms`, `/privacy`, `/faq`, `/support` and `/delete-account` must reach the app, not a host-level 404.
6. After both services pass the checks below, restore automatic deployment if you normally use it.
7. Remove temporary **GitHub maintenance** secrets again if desired. **Do not remove the working Render runtime secrets**, especially the MFA encryption key, database/TLS or Storage configuration.

## 5. Browser acceptance checks — disposable test data only

### Pages and terminology
- Open the footer on desktop and mobile. All five destinations must work; existing order/complaint tracking and marketplace rules remain available.
- Terms and Privacy must visibly say **Draft — not finalised for publication**. No operator identity, support email, fixed retention period or Qatar-only hosting claim has been invented.
- Existing Support form/tracking must still work. WhatsApp should open **+974 6604 6431**.
- Vendor onboarding/profile must ask for a **CR/business-registration licence**, not national ID/passport/driving licence. Try a disposable JPEG/PNG/WebP CR test image. The current uploader still does **not** accept PDFs.

### Request/review/status
1. Sign into a disposable buyer account → Account deletion.
2. Wrong password must be rejected. Correct password plus acknowledgement must create one pending request; repeated submissions must not create multiple open requests.
3. Download the private receipt. Keep its reference and access key private. No automated email is sent and the key is not automatically saved in browser storage.
4. In another window, sign into the real admin dashboard using your **working time-based authenticator** → Privacy requests.
5. Open the request, send an “In review” or “Needs customer action” response. Confirm the customer's status page reflects it.
6. Test withdrawal on a separate disposable request before processing. Review status changes alone must not delete the account.
7. Read **`docs/ACCOUNT-DELETION-RUNBOOK.md`** before completing anything. For a disposable record with no obligations, document a synthetic retention decision, future review date and the actual manual checks. Complete it.
8. Confirm the old account cannot sign in, its profile is anonymised, and the downloaded receipt can still show completion without login.
9. With a separate disposable vendor, verify an open order/booking or unresolved complaint/statement blocks completion. Do not falsify statuses just to bypass this safeguard.
10. After genuine review and resolution, test vendor completion: its store/listings disappear from public view, known owned CR/logo/listing objects are removed from the correct Storage buckets, and **another customer's historical transaction remains intact**.
11. Where an old public CR or orphaned/external file exists, verify the manual cleanup/retention procedure too. This package does not certify prior public documents or actual production Storage ACLs.

### If something fails
- New API cannot start: check the migration-013 ledger result, database TLS/connectivity and deployed commit; do not reset MFA.
- Deletion route returns 404: frontend/API commits may not match or the new API was not deployed.
- Completion returns a Storage error: request stays **processing** and account remains blocked. Correct Storage configuration/permissions, redo the necessary review and use **Retry reviewed completion**. Do not set `completed` manually in Supabase.
- Another completion is running: refresh after it finishes. If a server was interrupted mid-run, wait up to 10 minutes for its completion lease to expire before retrying.
- Lost receipt: contact Support and verify ownership. There is no key-recovery button in this release.
- Retention dates are manual follow-up dates, **not automated purge jobs**. Admins must actually perform and record those reviews.

## 6. Finalise the drafts before presenting them as final policies

Edit **`web/src/legalConfig.ts`** on GitHub. This contains public configuration only, not secrets.

Still needed: legal operator name, CR, postal address, actual providers/hosting regions/international transfers and safeguards, purpose-specific processing grounds/consent handling, retention and backup/CDN disposal procedures, privacy-request operations, Qatar legal/consumer review, version/effective date and publication/notice/assent decisions.

Keep `draft: true` until these are confirmed. A footer and a draft policy are not a Qatar compliance certificate, and this release does not assert that each footer page is individually mandatory. Public privacy information is relevant even though verification collects CR documents rather than personal IDs.

## Validation performed before packaging

- API and frontend production builds passed.
- **51** deletion API/PostgreSQL integration checks.
- **45** legal/deletion real-browser checks.
- Existing **62** security/commerce + **34** booking + **10** online-setup + **5** security-browser checks passed.
- **207 checks total**; migration applied successfully and a repeat migration run made no changes.
- Both npm audits reported **0 vulnerabilities** at test time. Lockfiles unchanged.
- The frontend retains a non-fatal large-JavaScript-chunk warning (~967 kB uncompressed).

Tests used an isolated local PostgreSQL database. Storage deletion integration tests used a local HTTP stub. They do not prove live Supabase permissions, CDN cleanup, legal compliance or production deployment success. **No live service or database was changed while preparing this package.**
