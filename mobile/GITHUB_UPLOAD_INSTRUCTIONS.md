# GitHub browser upload checklist

The companion archive `sokoni-hub-mobile-and-recovery-upload.zip` preserves the required repository paths. Extract it on your computer; do **not** upload the ZIP itself to the repository.

In the GitHub web interface for `Kozino/sokoni-hub`:

1. Use **Add file → Upload files** at the repository root and drag in the extracted `mobile` folder. GitHub will create the folder and preserve its nested `assets` and `src` files. Do not upload `node_modules` or `dist`; they are deliberately absent.
2. Browse to `api/src/routes`, choose **Upload files**, and replace `auth.ts`.
3. Browse to `api/src`, choose **Upload files**, and replace `server.ts`.
4. Browse to `db/migrations`, choose **Upload files**, and add `015_account_recovery.sql` (do not replace migration 014).
5. Browse to `.github/workflows`, choose **Upload files**, and add `consumer-mobile-build.yml`.
6. Commit all changes to `main` with a message such as `Add consumer mobile app and secure account recovery`.

Then:

1. Confirm the normal **Quality and security** GitHub Action is green.
2. Run **Online security setup** using its documented `migrate` option to apply migration 015 before relying on password/PIN recovery. This is an additive migration.
3. Add Render's existing supported mail-provider variables when ready. Recovery requests always return a generic result; email starts working with no app update after provider activation.
4. For Android/iOS cloud builds, add an Expo token to GitHub Actions as `EXPO_TOKEN`, then run **Consumer mobile build** from GitHub Actions. Details are in `mobile/README.md`.

No secret should be copied into a GitHub file: not `EXPO_TOKEN`, `EMAIL_API_KEY`, `JWT_SECRET`, `PIN_PEPPER`, `DATABASE_URL`, or `CRON_SECRET`.
