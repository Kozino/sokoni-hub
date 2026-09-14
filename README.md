# Sokoni Hub — multi-vendor marketplace for African food-stuff traders & service providers

A production-ready marketplace that gives WhatsApp-only sellers a real, searchable storefront.
**Vendors register → an admin verifies them → only then can they publish.** Buyers shop with
**cash on delivery** or a one-tap **WhatsApp** handoff, with no account required.

Built with **React + TypeScript (Vite)**, **Node/Express + TypeScript**, and **PostgreSQL (Supabase)**.

```
marketplace/
├── api/      Express + TypeScript REST API      → deploy to Render
├── web/      React + TypeScript (Vite) SPA      → deploy to Netlify
└── db/
    └── schema.sql   full PostgreSQL schema      → run once in Supabase
```

---

## What's implemented

### Vendors
- Self-registration, then a 3-step onboarding wizard (business details → logo + ID document → confirm).
- **Cannot publish anything until an admin verifies the store.** Rejected vendors see the reason and
  are auto-resubmitted when they edit their profile. Suspended vendors are frozen and their live
  listings are pulled down automatically.
- Dashboard (`/vendor`): revenue area chart (30 days), orders-by-status donut, top-listings bar chart,
  stock alerts (out-of-stock / low ≤5), views, open complaints, recent orders.
- Listings manager: products **and** services in one table, inline stock editing, pause/publish,
  edit, delete, search and type tabs.
- Product fields: name, description, price, currency, **quantity**, **unit** (kg/litre/bag/pack/…),
  **weight in kg**, **volume in litres**, up to 6 photos.
- Service fields: price type (fixed / from / hourly), session duration, service area, photos.
- Order pipeline: `pending → confirmed → dispatched → delivered` (or cancelled), with a WhatsApp
  button to message the buyer.
- Complaints filed against the store, with the admin's ruling visible.

### Buyers (no dashboard — by design)
- Browse and search with filters: keyword, product/service, category, city, price range, sort, paging.
- Listing detail with gallery, full specs, stock state, related items, and a WhatsApp order button.
- Cart that **splits a multi-vendor order into one order per vendor** automatically.
- Guest checkout — name, phone, address, city, country + payment method
  (**cash on delivery**, WhatsApp, bank transfer). Returns an order code per vendor.
- Public order tracking by **order code + phone** (no login).
- Public complaint filing and tracking by reference code.
- Optional account for order history and profile/password management.

### Admin
- Overview: users, vendors by status, listings, orders, GMV, open complaints,
  30-day signup and order/GMV trends, listings-by-category, top vendors, live activity feed.
- **Verification queue** with document review, one-click verify, reject-with-reason, suspend, reinstate.
- Listing moderation (remove / restore), order oversight, user management (enable/disable, create admins),
  category management (including toggling a category to *prohibited*), and an immutable audit log.

### Prohibited-goods enforcement (cosmetics & medicine)
Blocked at four layers:
1. `categories.is_banned` — banned categories are never returned to vendors or buyers.
2. A `banned_keywords` table screened against every business name, listing title and description.
3. Admin can flag any category as prohibited at runtime, and remove individual listings.
4. Public policy page plus explicit consent checkboxes at registration and onboarding.

---

## Local development

**Prerequisites:** Node 20+, and a PostgreSQL database (local or Supabase).

### 1. Database
Run `db/schema.sql` once against your database — in the Supabase SQL editor, or:
```bash
psql "$DATABASE_URL" -f db/schema.sql
```
It is idempotent: enums, tables, indexes, triggers, the 17 allowed categories, the 2 banned ones,
and the keyword blocklist.

In Supabase also create a public storage bucket for images:
```sql
insert into storage.buckets (id, name, public) values ('listings','listings', true)
  on conflict do nothing;
```

### 2. API
```bash
cd api
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, Supabase keys
npm install
npm run migrate           # optional: applies db/schema.sql for you
npm run seed:admin        # interactive — creates your first admin account
npm run dev               # http://localhost:4000
```

### 3. Web
```bash
cd web
npm install
npm run dev               # http://localhost:5173
```
In development the Vite dev server proxies `/api` → `http://localhost:4000`, so no
`VITE_API_URL` is needed locally.

### 4. Tests
An end-to-end suite covering **51 assertions** across the whole business flow —
registration, prohibited-goods screening, verification gating, listings, checkout,
stock decrement, overselling, order pipeline, dashboards, complaints, moderation,
suspension cascade and auth guards:
```bash
cd api
API=http://localhost:4000 ./test-e2e.sh
# optional: reset the DB first so the run is repeatable
RESET_DB_URL="$DATABASE_URL" API=http://localhost:4000 ./test-e2e.sh
```

---

## Deployment

### Supabase (database + file storage)
1. Create a project, then run `db/schema.sql` in the SQL editor.
2. Create the public `listings` storage bucket (SQL above).
3. Copy the **connection string** (Settings → Database → URI — use the *pooler* URI, port 6543)
   and the **service role key** (Settings → API).

### Render (API)
Create a **Web Service** from this repo:

| Setting | Value |
| --- | --- |
| Root directory | `api` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:
```
DATABASE_URL=<supabase pooler URI>
PGSSL=true
JWT_SECRET=<long random string>
JWT_EXPIRES=7d
CORS_ORIGINS=https://<your-site>.netlify.app
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_BUCKET=listings
NODE_ENV=production
```
After the first deploy, create your admin from the Render shell:
```bash
ADMIN_NAME="Your Name" ADMIN_PHONE="234..." ADMIN_PASSWORD="..." npx tsx src/scripts/createAdmin.ts
```

### Netlify (web)
| Setting | Value |
| --- | --- |
| Base directory | `web` |
| Build command | `npm run build` |
| Publish directory | `web/dist` |

Environment variable:
```
VITE_API_URL=https://<your-api>.onrender.com
```
`netlify.toml` already contains the SPA redirect so deep links like `/vendor/listings` work.

> Set `CORS_ORIGINS` on Render to your real Netlify URL once you know it. Any
> `*.netlify.app` origin is also allowed by default to make first deploys painless.

---

## API reference

`POST` bodies are JSON. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | public | Liveness + DB check |
| POST | `/api/auth/register` | public | Create buyer or vendor account |
| POST | `/api/auth/login` | public | Login with phone **or** email |
| GET | `/api/auth/me` | auth | Current user + vendor profile |
| PATCH | `/api/auth/me` | auth | Update profile |
| POST | `/api/auth/change-password` | auth | Change password |
| GET | `/api/meta/categories` | public | Allowed categories only |
| GET | `/api/meta/stats` | public | Homepage counters |
| GET | `/api/meta/policy` | public | Prohibited list, payment methods, units |
| GET | `/api/listings` | public | Search/filter/sort/paginate |
| GET | `/api/listings/cities` | public | Cities with verified vendors |
| GET | `/api/listings/:id` | public | Detail + related (increments views) |
| GET | `/api/listings/mine/all` | vendor | Own listings (any status) |
| POST | `/api/listings` | vendor ✔ | Create (screens prohibited goods) |
| PATCH | `/api/listings/:id` | vendor ✔ | Update |
| PATCH | `/api/listings/:id/stock` | vendor ✔ | Quick stock update |
| DELETE | `/api/listings/:id` | vendor | Soft-delete |
| POST | `/api/vendors/onboard` | auth | Submit store for verification |
| GET/PATCH | `/api/vendors/me` | vendor | Own store profile |
| GET | `/api/vendors/dashboard` | vendor | Stats, trends, top listings, orders |
| GET | `/api/vendors` | public | Verified store directory |
| GET | `/api/vendors/:slug` | public | Public storefront |
| POST | `/api/vendors/:id/reviews` | auth | Rate a store |
| POST | `/api/orders/checkout` | public | Guest or logged-in; splits per vendor |
| GET | `/api/orders/track` | public | By `?code=` + `?phone=` |
| GET | `/api/orders/mine` | auth | Buyer order history |
| GET | `/api/orders/vendor` | vendor | Incoming orders |
| PATCH | `/api/orders/vendor/:id/status` | vendor | Advance the pipeline |
| POST | `/api/complaints` | public | File a complaint |
| GET | `/api/complaints/track/:code` | public | Track by reference |
| GET | `/api/complaints/vendor` | vendor | Complaints against you |
| POST | `/api/uploads` | auth | Multipart images/PDF → Supabase Storage |
| GET | `/api/admin/overview` | admin | Full platform analytics |
| GET | `/api/admin/vendors` | admin | Verification queue |
| POST | `/api/admin/vendors/:id/verify\|reject\|suspend\|reinstate` | admin | Verification actions |
| GET | `/api/admin/listings` | admin | Moderation list |
| POST | `/api/admin/listings/:id/remove\|restore` | admin | Moderate a listing |
| GET/PATCH | `/api/admin/complaints` | admin | Complaint management |
| GET/PATCH/POST | `/api/admin/users` | admin | Manage users, create admins |
| GET/POST/PATCH | `/api/admin/categories` | admin | Manage + prohibit categories |
| GET | `/api/admin/orders` | admin | All orders |
| GET | `/api/admin/audit` | admin | Audit log |

✔ = also requires the vendor to be **verified**.

---

## Security notes
- Passwords hashed with bcrypt; stateless JWT auth; role checks enforced **server-side** on every route.
- Zod validation on all request bodies; parameterised SQL everywhere (no string interpolation).
- Helmet, CORS allowlist, and rate limiting (60 auth requests / 15 min, 300 API requests / min).
- Uploads restricted to JPEG/PNG/WebP/PDF, 5 MB, max 6 files.
- ID documents are only ever returned through admin-scoped endpoints.
- Every sensitive action is written to `audit_log` with actor, entity and metadata.
