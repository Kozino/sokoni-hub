# Transactional email + receipt-email patch

This is the small replacement-file package for the transactional-email release and the Gmail receipt-rendering correction. It deliberately excludes unrelated website/dashboard/mobile files.

## New files — add these at the same paths

- `api/src/transactionalEmail.ts` — shared branded transactional email templates.
- `api/src/sokoniBrand.ts` — embedded brand asset used by the browser-print receipt template.
- `db/migrations/016_transactional_email.sql` — additive database migration for verification tokens, existing-user verification backfill, and checkout `contact_email`.
- `web/src/pages/VerifyEmail.tsx` — verification and resend-link page.
- `TRANSACTIONAL_EMAIL_DEPLOYMENT.md` — Render/Netlify/Resend deployment checklist.

## Existing files — replace these at the same paths

- `api/.env.example` — documents `APP_URL`.
- `api/src/config.ts` — adds public `APP_URL` handling for email links.
- `api/src/routes/auth.ts` — registration verification, verification/resend endpoints, and sign-in protection for new unverified accounts.
- `api/src/routes/bookings.ts` — booking created/vendor alert/customer status messages.
- `api/src/routes/orders.ts` — order messages, checkout email snapshot, and email-safe delivered receipt sending.
- `api/src/templates.ts` — contains both the browser-print receipt and the new email-safe receipt renderer.
- `web/src/App.tsx` — adds `/verify-email` route.
- `web/src/state/AuthContext.tsx` — registration verification response handling.
- `web/src/pages/Auth.tsx` — directs newly registered users to verification.
- `web/src/pages/Checkout.tsx` — optional checkout recipient email field.
- `web/src/components/BookServiceModal.tsx` — pre-fills optional booking email for signed-in users.
- `web/src/pages/Legal.tsx` — updates the email-notification FAQ copy.

## Receipt-email correction

The receipt delivery code now calls `receiptEmailHtml()` rather than the browser print template. The email renderer uses normal inline email HTML only: no data-URI logo, no JavaScript, and no Print/Save button. This prevents Gmail from displaying raw base64/HTML source like the received message.

The separate browser receipt page is retained for printing or saving as PDF.

## Deployment reminder

Before deploying the API code, apply migration 016 through the Render build/pre-deploy step described in `TRANSACTIONAL_EMAIL_DEPLOYMENT.md`. Set `APP_URL=https://sokonihub.qa` in Render.

## Mobile

No mobile files are included or changed in this patch.
