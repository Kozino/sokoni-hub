# Transactional email deployment checklist

This package adds email verification plus customer/vendor notifications for service bookings and orders. It is ready for a GitHub → Render → Netlify deployment.

## 1. Upload this package to GitHub

Replace the repository contents with the contents of this ZIP, then commit/push through the GitHub website. Do not upload either of the older ZIP files that may have been in an earlier package.

## 2. Set the Render API service configuration

Open the existing Render API Web Service → **Environment** and confirm these values:

| Key | Production value |
|---|---|
| `APP_URL` | `https://sokonihub.qa` |
| `CORS_ORIGINS` | `https://sokonihub.qa,https://www.sokonihub.qa` (plus any required Netlify preview URL) |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_API_KEY` | Your Resend API key |
| `EMAIL_FROM` | A verified Resend sender, e.g. `notifications@sokonihub.qa` |
| `EMAIL_FROM_NAME` | `Sokoni Hub` |
| `EMAIL_REPLY_TO` | Your monitored support email address (recommended) |

`APP_URL` is important: it makes verification, booking, and order links open the public website instead of localhost or an API address.

## 3. Make the database migration run automatically on the next deploy

The new `db/migrations/016_transactional_email.sql` must be applied before the new API code starts. In Render, open the API service → **Settings** → **Build & Deploy**, and set its **Build Command** to:

```text
npm run render-build && npm run migrate:prod
```

Keep the existing start command (`npm start`). Then use **Manual Deploy → Deploy latest commit**. The migration runner is idempotent: after it has applied migration 016, later deploys report it as already applied.

> If the service already has a Render pre-deploy command feature configured, use `npm run migrate:prod` there instead and leave the build command as `npm run render-build`.

## 4. Netlify

No new Netlify environment variable is required for email. Keep the website's existing API URL pointed at the Render API. Confirm that both `https://sokonihub.qa` and (if used) `https://www.sokonihub.qa` are assigned to the Netlify site and allowed in Render `CORS_ORIGINS`.

## 5. Verify after deployment

1. Create a new test buyer account and confirm that the verification email arrives and its link opens `/verify-email` on `https://sokonihub.qa`.
2. Sign in after verifying, place a test booking with an email address, and check the customer confirmation and vendor alert.
3. Update that booking as the vendor to confirmed, rescheduled, completed, and cancelled; check the customer update emails.
4. Place an order with the optional checkout email field; check both the customer order confirmation and the vendor new-order alert.
5. Change an order to confirmed/dispatched/cancelled, then delivered; confirm the status messages and branded delivered receipt.
6. In the API database, review `email_log` for `sent`, `failed`, or `skipped` records if an expected email does not arrive.

## Notes

- Existing accounts are backfilled as verified by migration 016 so they are not locked out by this release.
- New verification links are single-use, SHA-256-hashed in the database, and expire after 24 hours.
- Checkout email is a snapshot for that order. It supports both signed-in and guest buyers and can be different from an account email.
- Messages are sent after the booking/order transaction commits. A Resend delivery failure is logged but never cancels a customer booking or order.
