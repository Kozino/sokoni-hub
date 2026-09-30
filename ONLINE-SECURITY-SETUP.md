# Apply Security Release 1 online — no terminal and no backup step

Use **sokoni-security-release-1-online.zip**, not the original ZIP by itself. This package adds a manual GitHub Actions setup workflow so you do not need Bash, a terminal or Render Shell. GitHub runs the required maintenance commands after you click **Run workflow**.

You chose to skip backups because your data/files are disposable tests. These instructions do not reset/drop your database. The security migration is additive but changes permissions and invalidates old sessions.

**Only follow this for your own repository and Supabase project. Never send passwords, keys, MFA seeds, recovery codes or database connection strings in chat or screenshots.** No live setup has been performed for you.

## 1. Pause automatic production deployment

In **Render**, open your existing API service → Settings → find **Auto-Deploy** and set it to **Off** (labels may vary).

In **Netlify**, open your existing site → Deploys → disable automatic publishing, usually **Stop auto publishing**. Keep the current published deployment while preparing this release.

This is not the same as pausing all application writes. Since this is a disposable testing site, do not place test orders/bookings, change admin settings or upload files while performing setup. Do not invite real users until finished.

Do not delete either hosting service. Do not reset Supabase. If you already uploaded the original ZIP, you can still use the updated package; the original application changes are included unchanged.

## 2. Upload the updated ZIP contents to GitHub

1. Download and extract **sokoni-security-release-1-online.zip** on your computer.
2. Open `Kozino/sokoni-hub` on GitHub, on the default branch (normally `main`).
3. Choose **Add file → Upload files**.
4. Drag the extracted contents into the repository **root**, merging them into existing folders.
5. Include the hidden **`.github`** folder and **`.gitignore`**. On Mac, Command+Shift+period reveals hidden files in file dialogs.
6. Commit the upload. If GitHub proposes a pull request instead, review and merge it before continuing.

Do NOT upload the ZIP itself as the app. Do NOT delete the existing `api`, `web` or `db` folders. Do NOT place the contents inside an extra enclosing folder. Do NOT upload a real `.env`, credentials, backups, `node_modules` or generated builds.

Check these exact repository paths exist afterwards:

- `.github/workflows/online-security-setup.yml`
- `.github/workflows/quality.yml`
- `api/src/scripts/onlineSetup.ts`
- `db/migrations/012_security.sql`
- `db/online-setup-generate.sql`
- `ONLINE-SECURITY-SETUP.md`

Uploading does NOT apply SQL. The new workflow must be in the default branch before the manual Run workflow button is reliably available. If your repository has changed beyond the original release base, reconcile your custom changes before overwriting files.

## 3. Let the ordinary quality checks run

Open GitHub → **Actions → Quality and security**. The upload should start this automatically.

Wait for a green result. This workflow uses a **temporary test database**, not live Supabase. If it fails, stop and share only the redacted error text; do not deploy anyway.

If Actions is disabled, enable it for your repository. Account permissions, Actions usage limits or organisation restrictions may need adjustment in GitHub.

## 4. Create a protected GitHub maintenance environment

Open GitHub repository → **Settings → Environments → New environment**.

Name it exactly:

`production-maintenance`

Where supported, restrict deployment branches to your default branch and add a trusted required reviewer. The workflow itself also refuses non-default branches. Limit repository write/admin access: someone who can alter trusted workflow code could misuse its credentials.

Inside this environment, under **Environment secrets**, add:

| Name | Value |
|---|---|
| `MAINTENANCE_DATABASE_URL` | Your real Supabase **Session pooler** connection URI, including the correctly encoded database password. |
| `PGSSL_CA` | The trusted Supabase database CA certificate if required by your project; full PEM text. Omit only if the normal trusted certificate chain works. |

Get the connection URI from Supabase → **Connect → Session pooler**, usually port **5432**. Use the connection details shown for your project, not a sample project. A transaction-pooler URI on port 6543 is NOT suitable for this migration job's session advisory lock.

Use the existing database password. Do not reset it merely to copy a connection string. If it contains reserved URL characters, use its percent-encoded form; your working Render `DATABASE_URL` can help identify the existing password/encoding, but use the session-pooler host/port from Supabase for this job.

Use a database owner/appropriately privileged server credential for migration. Do not use the Supabase API anon key or service-role JWT as the database password.

## 5. Run the read-only readiness check

Go to GitHub → **Actions → Online security setup → Run workflow**.

- Branch: your default branch, normally `main`.
- Task: **`check`**.
- Confirmation: leave blank.
- Click **Run workflow** and approve the environment review if configured.

Wait for green. The log should say **Read-only readiness check passed**.

This checks database connectivity, representative historical columns and the existence of an active administrator. It does not prove every previous data migration was applied. Confirm that your existing working installation already used all SQL migrations through **011**, plus `db/pin-migration.sql`.

If it reports a missing historical column, stop and resolve that missing migration. If certificate verification fails, configure the correct provider CA; do NOT disable TLS verification. If it says no active administrator exists, stop and request account setup assistance.

## 6. Generate and privately save administrator setup values

This step uses the **Supabase SQL Editor**, not Bash.

1. In GitHub, open `db/online-setup-generate.sql` and copy its SQL contents.
2. Open your Supabase project → **SQL Editor → New query**.
3. Paste the SQL and click **Run**.
4. Privately copy the four result values into your password manager.

The query only generates random values; it does not change tables or application records.

| Result column | What to do with it |
|---|---|
| `admin_mfa_seed` | Add to your authenticator app and temporary GitHub environment secret below. |
| `admin_mfa_recovery_codes` | Save all ten codes offline/in your password manager; also supply the temporary GitHub secret below. |
| `new_mfa_encryption_key` | Use only if Render does NOT already have an MFA encryption key. |
| `new_jwt_secret` | Use only if the current JWT secret is missing, weak or a development placeholder. Existing strong secrets need not be changed. |

**Never replace an existing `MFA_ENCRYPTION_KEY` used for enrolled admins. Never replace your existing `PIN_PEPPER` as part of this setup.** Losing or changing these can make existing credentials unusable.

Do not run the query repeatedly and mix values from different results. If doing another administrator later, use their own new seed and recovery codes, but keep the SAME existing server encryption key.

## 7. Add the authenticator account and remaining GitHub secrets

On your phone, open Google Authenticator, Microsoft Authenticator or another TOTP app:

1. Add an account using **Enter setup key/manual entry**.
2. Account name: something like `Sokoni Admin`.
3. Setup key: the saved **`admin_mfa_seed`**.
4. Type: **Time based** (standard six-digit code, 30 seconds).
5. Save. Keep your phone's date/time automatic.

Then return to GitHub → Settings → Environments → `production-maintenance` → Environment secrets. Add:

| Secret name | Exact value |
|---|---|
| `ADMIN_IDENTIFIER` | The existing admin account's email address OR exact stored phone number. This is not necessarily your GitHub/Supabase login. |
| `ADMIN_MFA_SEED` | The SAME seed you entered into the authenticator app. |
| `ADMIN_MFA_RECOVERY_CODES` | All ten recovery codes, one per line, with no quotes, brackets or headings. |
| `MFA_ENCRYPTION_KEY` | Your existing Render key, or the saved new key if no key exists yet. This MUST match Render later. |

Use **secrets**, not ordinary repository files or public workflow inputs. Do not enter the changing six-digit authenticator code as `ADMIN_MFA_SEED`.

## 8. Apply the database migration by clicking Run workflow

GitHub → Actions → **Online security setup → Run workflow**:

- Task: **`migrate`**.
- Confirmation: type exactly:

`I VERIFIED MIGRATIONS THROUGH 011 AND PIN`

- Click Run workflow and approve any environment review.

Wait for green and **Online database migration completed**.

The workflow records/adopts the existing migration history, without replaying its historical data updates, and applies security migration 012. If the migration was already recorded correctly, it safely checks/skips it. It does not reset your database.

**Do not paste only `012_security.sql` into Supabase as a substitute.** The new API also requires the migration ledger entry, which this workflow creates correctly.

## 9. Enroll the existing administrator by clicking Run workflow

Run **Online security setup** once more:

- Task: **`enroll`**.
- Confirmation: leave blank.

Wait for green and **Administrator MFA enrolled**.

This saves the encrypted authenticator secret and hashed recovery codes. It does not print them in logs. It does not create a new admin or change their password.

If it says **Administrator MFA is already enrolled**, nothing was overwritten. Use that account's existing authenticator/recovery codes; do not rotate the encryption key or keep trying new seeds. This workflow intentionally cannot reset an already-enrolled admin.

Repeat steps 6–7 and enrollment separately for each other active administrator, changing `ADMIN_IDENTIFIER`, seed and recovery codes, but NOT the shared encryption key.

## 10. Create the private Storage bucket online

In Supabase → **Storage → New bucket**:

- Name: `vendor-documents`.
- **Public bucket: OFF**.

Keep the existing public product-image bucket (usually `listings`) unchanged. If `vendor-documents` already exists, verify that it is private.

Because you have disposable test files, you do not have to run the legacy document migration utility now. After deployment, remove the old ID reference in a test vendor's profile and upload a fresh JPEG/PNG/WebP through the new private uploader. In Supabase Storage, manually delete ONLY positively identified old test ID files from the public bucket once they are no longer needed. Do not delete all listing images or make the whole listing bucket private.

Any real identity document in a public bucket still needs removal/migration. Declaring it a test file does not make real identity information non-sensitive.

## 11. Configure and deploy Render

After migration and enrollment are successful, open Render → your API service → **Environment**. Preserve existing unrelated settings.

| Setting | Value |
|---|---|
| `NODE_VERSION` | `24` (or the hosting UI's Node 24 runtime selection). |
| `NODE_ENV` | `production` — never copy the workflow's `maintenance` value here. |
| `DATABASE_URL` | Your working server database URI. |
| `PGSSL` | `true`. |
| `PGSSL_CA` | Correct provider CA certificate where required. |
| `JWT_SECRET` | Existing strong secret, or the new generated value if replacing a weak/default/missing one. |
| `PIN_PEPPER` | Keep the existing value unchanged. It must already be a strong 32+ character value. If missing, stop and ask before replacing it. |
| `MFA_ENCRYPTION_KEY` | EXACT same encryption key used in GitHub enrollment. |
| `CORS_ORIGINS` | Exact website origin, e.g. `https://your-site.netlify.app`. No trailing slash or wildcard. Separate multiple trusted origins with commas. |
| `SUPABASE_URL` | Existing project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-side key, never exposed to the frontend. |
| `SUPABASE_BUCKET` | Existing public image bucket, usually `listings`. |
| `SUPABASE_PRIVATE_BUCKET` | `vendor-documents`. |
| `EMAIL_PROVIDER` | `none`. |

Do not add `ADMIN_MFA_SEED` or recovery codes to Render. The encrypted seed/recovery hashes are already in the database.

Your Render service should use:

- Root Directory: `api`.
- Build Command field: `npm ci && npm run build`.
- Start Command field: `npm start`.

These are **hosting configuration fields**, not commands you need to run in a terminal. Do not use the repository's old `api/render.yaml` to provision a new service; it is not a valid Blueprint.

Save the configuration. If saving automatically starts a deployment, let it finish. Otherwise choose **Manual Deploy → Deploy latest commit**. Check that the deployment is the updated default-branch commit and reaches the Live state.

Do not disable TLS/RLS/MFA to make a failed deployment start. Check the error and resolve the setup problem.

## 12. Deploy and publish Netlify

Open Netlify → your existing website. Confirm its existing project settings still build the `web` app:

- Base directory: `web` for the normal single-app configuration used here.
- Build command: `npm run build`.
- Publish directory: `dist`, relative to that base.
- `VITE_API_URL`: the Render API origin, e.g. `https://your-api.onrender.com`, normally **without `/api`** because the client appends it.
- Node version: 24; the supplied `web/netlify.toml` sets this.

If your site uses Netlify's monorepo/package-directory configuration instead of Base directory, keep its equivalent working layout rather than changing both blindly.

Trigger a new deployment of the same release commit. Once built, **publish that deployment** (or re-enable automatic publishing and publish the latest successful deploy). Confirm the live site uses the new build, not merely a deploy preview.

## 13. Test, clean up temporary secrets, then resume normal deployment

Open the live site in a private/incognito window:

1. Admin sign-in: existing password → authenticator code → dashboard.
2. Normal buyer/vendor login and PIN flow.
3. `/account`: sessions, booking history and order history.
4. A test product purchase, retry/cancellation, and a service booking.
5. A new private ID upload and authorised admin review.
6. Complaint tracking with reference and full phone number.

Old sessions being signed out is expected. Receipt/booking email is not activated by this deployment; `EMAIL_PROVIDER=none` remains intentional. The broader roadmap items listed as pending in `SECURITY-RELEASE-1.md` are still pending.

After successful setup of ALL administrators, remove these temporary secrets from the **GitHub maintenance environment**:

- `ADMIN_MFA_SEED`
- `ADMIN_MFA_RECOVERY_CODES`
- `ADMIN_IDENTIFIER`
- `MFA_ENCRYPTION_KEY`
- `MAINTENANCE_DATABASE_URL`
- `PGSSL_CA` if no longer needed for maintenance jobs.

**Do not remove the required runtime secrets from Render.** Keep the encryption key, PIN pepper and recovery codes securely in your password manager. Restore maintenance secrets temporarily only when you intentionally need a later approved maintenance run.

Re-enable Render auto-deploy and Netlify automatic publishing after the release is verified. Where possible require the ordinary Quality and security checks to pass before merging future updates.

## Stop and ask for help if…

- Quality checks fail.
- The readiness check finds missing historical migrations.
- MFA is already enrolled but you do not have its existing authenticator/recovery codes.
- You cannot identify the original PIN pepper or the existing MFA encryption key.
- Database TLS verification fails.
- You see a blank site, repeated 401/500 responses or an unexpected database-role permission error.

Share only the error message and the step number, with secrets removed. Do not send full environment screenshots.

## Validation of this online add-on

The API builds successfully. Ten local PostgreSQL checks passed for random-value generation, readiness, confirmation gating, migration rerun, enrollment, secret-output avoidance, encryption/recovery storage, refusal to overwrite existing MFA and successful TOTP verification.

The underlying release previously passed 62 security/commerce checks, 34 booking checks and 5 browser checks. The new GitHub-hosted workflow has not been run on your repository, and your hosted setup has not been inspected or changed. Test results are not a claim that your production rollout is complete.
