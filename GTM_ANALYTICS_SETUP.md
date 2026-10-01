# Google Tag Manager analytics setup

Sokoni Hub is configured for the Google Tag Manager container:

```text
GTM-TJL3GPXP
```

This is a **GTM container ID**, not a GA4 Measurement ID. Do not put it in a `VITE_GA_MEASUREMENT_ID` setting and do not use direct `gtag.js` installation.

## 1. Netlify environment variable

In Netlify: **Site configuration → Environment variables**, add:

| Key | Value |
|---|---|
| `VITE_GTM_CONTAINER_ID` | `GTM-TJL3GPXP` |

Then deploy again. The `VITE_` value is deliberately public in the built website; GTM container IDs are not secrets.

With no valid `VITE_GTM_CONTAINER_ID`, the site loads **no GTM script**, displays **no analytics banner**, and its Privacy/Cookie pages state that optional analytics is not enabled.

## 2. Configure GA4 inside GTM

A GTM container does not collect anything by itself. In the GTM workspace, configure the GA4 Measurement ID belonging to your own GA4 property **inside GTM**:

1. Add a **Google tag** with the GA4 Measurement ID (`G-...`).
2. Set `send_page_view` to `false` for that Google tag.
3. Create a **Custom Event** trigger with event name:
   ```text
   sokoni_page_view
   ```
4. Add a GA4 Event tag named `page_view`, triggered only by `sokoni_page_view`.
5. Pass the data-layer variables `page_path`, `page_location`, and `page_title` as the equivalent GA4 event parameters.
6. Do **not** add an All Pages page-view trigger, a History Change trigger, or any auto-page-view tag.

This is important: the website itself emits `sokoni_page_view` only after a visitor accepts analytics and only on allowed public/buyer routes. Sign-in, account, deletion, vendor, and admin routes never emit it.

Do not add advertising, remarketing, or other third-party tags to this container unless you separately update consent, privacy, and legal review.

## 3. GA4 property privacy settings

In the associated GA4 property, before enabling the container in production:

- Set event/user-data retention to **14 months**.
- Turn **Google signals** off.
- Turn **ads personalisation** off.
- Do not connect advertising products or enable remarketing unless the consent and legal notices are deliberately expanded and reviewed.

These are GA/GTM dashboard settings; they cannot be enforced by a Netlify environment variable.

## 4. Consent behaviour implemented in the website

- GTM is injected only after the visitor chooses **Accept analytics**.
- It is never inserted into `index.html` and has no pre-consent noscript iframe.
- A visitor can choose **Reject analytics** or later change the choice from the footer / `/cookies` page.
- Rejecting clears standard first-party Google Analytics cookies where the browser permits it and stops future Sokoni page-view events.
- The GTM script is allowed by the Netlify CSP only at `https://www.googletagmanager.com`.

## 5. Test after deployment

1. Open an incognito/private window at `https://sokonihub.qa`.
2. Before choosing a banner option, DevTools → Network should show no request to `googletagmanager.com`.
3. Select **Accept analytics** on a public marketplace page. A request to `gtm.js?id=GTM-TJL3GPXP` should appear.
4. In GTM Preview, verify a `sokoni_page_view` event on public pages.
5. Navigate to `/login`, `/account`, `/vendor`, and `/admin`; verify no new `sokoni_page_view` event is pushed.
6. Use **Cookie settings** → **Reject analytics**, then navigate again and verify no future page-view event is emitted.
