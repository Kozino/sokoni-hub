# Setting EMAIL_API_KEY

Email is **off by default**. `EMAIL_PROVIDER` defaults to `none`, and in that state
every send is recorded in `email_log` with status `skipped` and nothing throws. That
is why the app has been running fine without a key.

Turning it on is one decision (which provider) plus four environment variables on
Render. No code changes and no new npm packages — the mailer talks to the provider's
HTTP API using Node's built-in `fetch`.

---

## The variables

`EMAIL_API_KEY` alone does nothing. The mailer only considers itself enabled when
**all three** of these are present:

```ts
export const emailEnabled = provider !== 'none' && !!apiKey && !!from;
```

| Variable | Required | What it is |
|---|---|---|
| `EMAIL_PROVIDER` | **yes** | `resend` or `brevo`. Leave as `none` to keep email off. |
| `EMAIL_API_KEY` | **yes** | The secret from your provider dashboard. |
| `EMAIL_FROM` | **yes** | Sending address. Must be on a domain you have verified with the provider. |
| `EMAIL_FROM_NAME` | no | Display name. Defaults to `Sokoni Hub`. |
| `EMAIL_REPLY_TO` | no | Where replies go, if different from the sender. |

Set only `EMAIL_API_KEY` and leave `EMAIL_PROVIDER=none`, and email stays off.
This is deliberate — it makes enabling email an explicit act rather than a
side effect of pasting a key.

---

## Step 1 — pick a provider and get the key

Both are supported and both have a free tier that comfortably covers monthly
vendor statements.

### Resend (recommended — simpler)

1. Sign up at **resend.com**.
2. **Domains → Add Domain**, enter `yourdomain.com`.
3. Resend shows DNS records — typically one `MX`, and `TXT` records for SPF and
   DKIM. Add them at your registrar. Verification usually takes minutes.
4. **API Keys → Create API Key**, permission **Sending access**.
5. Copy it. It starts with `re_` and **is shown only once**.

Free tier: 3,000 emails/month, 100/day.

### Brevo (alternative)

1. Sign up at **brevo.com**.
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain**, add the DNS records.
3. **SMTP & API → API Keys → Generate a new API key**.
4. Copy it. It starts with `xkeysib-`.

Free tier: 300 emails/day.

> **You must verify a domain.** Providers will not let you send from a Gmail or
> Outlook address you do not control. If you do not have a domain yet, both
> providers give you a sandbox sender that only delivers to your own signup
> address — fine for the test in step 3, not for real vendors.

---

## Step 2 — set the variables on Render

1. Render dashboard → your **sokoni-hub** API service → **Environment**.
2. **Add Environment Variable** for each:

   ```
   EMAIL_PROVIDER   resend
   EMAIL_API_KEY    re_xxxxxxxxxxxxxxxxxxxx
   EMAIL_FROM       billing@yourdomain.com
   EMAIL_FROM_NAME  Sokoni Hub
   EMAIL_REPLY_TO   support@yourdomain.com
   ```

3. **Save Changes.** Render redeploys automatically — the variables are read at
   process start, so a restart is required. Wait for the deploy to go live.

Use Render's **secret** handling for `EMAIL_API_KEY`; do not commit it. It must
never appear in the repo, in `web/`, or in any `VITE_`-prefixed variable —
anything with a `VITE_` prefix is compiled into the public JavaScript bundle and
is readable by every visitor.

### Locally

Put the same lines in `api/.env`, which is gitignored. `api/.env.example` now
documents all of them.

---

## Step 3 — confirm it is actually on

The email log endpoint reports the flag directly. Log in as admin and call:

```bash
curl -s https://sokoni-hub.onrender.com/api/billing/email-log \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.enabled'
```

`true` means the three required variables are all present. `false` means one is
missing — most often `EMAIL_FROM`.

Then send one real statement:

1. Admin → **Billing → Statements**.
2. Pick a statement whose status is **issued** (draft statements are refused with
   a 409 — issue it first).
3. Click **Email to vendor**.

Check the result in the same log:

```bash
curl -s https://sokoni-hub.onrender.com/api/billing/email-log \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.emails[0]'
```

| `status` | Meaning |
|---|---|
| `sent` | Delivered to the provider. `provider_id` is their message ID — use it to trace the message in their dashboard. |
| `skipped` | Email is off, or the vendor has no address on their account. |
| `failed` | The provider rejected it. `error` holds their message. |

A successful send also stamps `vendor_statements.emailed_at`, so the UI can show
when a vendor was last billed.

---

## While you are in there: CRON_SECRET

The scheduled monthly billing run has the same problem — it is protected by
`CRON_SECRET`, and `POST /api/billing/cron/run` returns **503** until that is set.

```bash
openssl rand -hex 32
```

Add the output as `CRON_SECRET` on Render, then point a scheduler at:

```bash
curl -X POST https://sokoni-hub.onrender.com/api/billing/cron/run \
  -H "x-cron-secret: $CRON_SECRET"
```

A GitHub Actions scheduled workflow or cron-job.org both work. This doubles as
the Supabase keep-alive, since the run queries the database — which a plain
uptime ping against a static endpoint does **not** do, and is why free projects
pause after 7 idle days.

---

## Failure modes worth knowing

- **A failed email never rolls back the business action.** `sendMail` is wrapped so
  that a bounced receipt cannot un-deliver an order. Failures surface in
  `email_log` and the server console, not as a broken checkout.
- **`403` / `validation_error` from Resend** almost always means `EMAIL_FROM` is on
  an unverified domain.
- **Mail lands in spam** when SPF and DKIM are incomplete. Verify the domain shows
  green in the provider dashboard before sending to real vendors, and consider
  adding a DMARC record.
- **Images are blocked by default** in most mail clients, which is why the logo on
  statements and receipts carries `alt` text set to your business name.
- **The logo must be an absolute URL** for the same reason — a mail client has no
  idea what your site root is.
