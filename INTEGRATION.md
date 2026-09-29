> **Exact edits for your Checkout, VendorOverview and orders route are in `PATCHES.md`. They replace steps 3 and 4 below.**

# Sokoni Hub: shareable store links

Copy the folders into your repo (they mirror its layout), then follow these steps.

## 1. Install and configure

```bash
cd web
npm i qrcode
npm i -D @types/qrcode
```

**Netlify environment variables**

| Variable | Value | Why |
| --- | --- | --- |
| `API_URL` | `https://<your-api>.onrender.com` | Read at runtime by the edge function. Make sure it's available to Functions/runtime, not just builds. |
| `VITE_PUBLIC_SITE_URL` | `https://<your-domain>` | Base for the links and QR codes. Falls back to the current origin. |

Add a fallback preview image at `web/public/og-default.png` (1200x630, ideally under 300 KB). It's used when a vendor has no logo.

The edge function declares its own path (`/s/*`), so no `netlify.toml` change is needed. Keep the SPA redirect where it is. If your `netlify.toml` sits at the repo root, set `[build] edge_functions = "web/netlify/edge-functions"`.

## 2. Short link route (web)

In your router, next to the other public routes:

```tsx
import ShortStoreRedirect from "./pages/ShortStoreRedirect";

<Route path="/s/:slug" element={<ShortStoreRedirect />} />
```

Edit `storePath` in `ShortStoreRedirect.tsx` to point at your real storefront route.

## 3. Share panel (vendor dashboard)

```tsx
import ShareStorePanel from "../components/ShareStorePanel";

<ShareStorePanel slug={vendor.slug} businessName={vendor.business_name} />
```

Show it only for verified vendors, since unverified stores can't be public yet.

## 4. Attribution

**Database:** run `db/migrations/002_order_source.sql` in the Supabase SQL editor, and append it to `db/schema.sql`.

**Web checkout:** include attribution in the `POST /api/orders/checkout` body, and clear it after success.

```ts
import { getAttribution, clearAttribution } from "../lib/attribution";

const body = { ...checkoutFields, attribution: getAttribution() };
// ...after a successful response:
clearAttribution();
```

**API checkout:** extend the body schema and set `source` when inserting each per-vendor order.

```ts
import { attributionSchema, resolveOrderSource } from "../lib/attribution";

// in the checkout zod schema
attribution: attributionSchema,

// where you insert one order per vendor
const source = resolveOrderSource(body.attribution, vendor.slug);
// add `source` to the INSERT INTO orders (...) column list and values
```

**Vendor dashboard stat** (new query for `GET /api/vendors/dashboard`):

```sql
select source, count(*) as orders, coalesce(sum(total), 0) as gmv
from orders
where vendor_id = $1 and created_at > now() - interval '30 days'
group by source;
```

Attribution comes from the browser, so it's fine for analytics and for "the app brought you X customers", but don't bill on it without extra checks.

## 5. Test the preview

```bash
curl -A "WhatsApp/2.23.20" https://<your-site>/s/<slug> | grep -i "og:"
```

You should see the vendor's name, description, and logo. WhatsApp caches previews per URL, so after fixing something, test with a new query string or the Facebook Sharing Debugger. If the preview stays generic, check that `API_URL` is set and the API responds within about 5 seconds. Render's free tier sleeps when idle, so a scheduled ping to `/api/health` helps.

## 6. Custom domain

Add your domain in Netlify (Domain management), then update `VITE_PUBLIC_SITE_URL` and Render's `CORS_ORIGINS` to match.

## Assumptions to check against your code

- Tables and columns: `orders`, `vendor_id`, `total`, `created_at`.
- `GET /api/vendors/:slug` returns `business_name`, `description`, `city`, `logo_url` (directly or under `vendor`).
- The web app uses `react-router-dom`, and the storefront lives at `/store/:slug`.
- Checkout validates with zod and creates one order per vendor.
