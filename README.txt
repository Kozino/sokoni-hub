Sokoni Hub — Admin → Content
============================

Built on a fresh clone of https://github.com/Kozino/sokoni-hub.git (020c9fa).
Only these Content files are in the zip. Nothing else was mixed in.

What this is
------------
Admins can change Terms, Privacy, Marketplace policy, FAQ, support contact
and an optional announcement banner without a new web or app build.

Buyers on the website and in the app fetch GET /api/content (published copy
only). If that request fails, they keep the copy bundled in the client — Terms
never goes blank.

Vendor and admin dashboards stay English. Checkout, cart, payments and maps
are not editable here.

Deploy
------
1. Commit these files (same paths under the repo root).
2. Run the usual API migrate. It will apply:

     db/migrations/033_site_content.sql

   That creates content_pages and a site_content row in system_settings.
   The first admin or public content request also seeds the four documents
   from the current bundled wording (version 2026-10-01).

3. Redeploy API + web. Ship a new app binary when you want the fetch +
   banner; older app builds keep bundled legal.

How to use it
-------------
Sign in as admin → Content.

• Contact & banner — email, WhatsApp (digits with country code), hours, CR,
  operator name, optional home-screen / website bar. Saved immediately.
• Terms / Privacy / Policy / FAQ — Save draft (not public) or Publish.
  Publish writes version, effective date, timestamp, and an audit row
  (content.publish) with who published.

Markdown: ## heading, ### subheading, - list, **bold**.
Tokens filled at read time from Contact & banner:

  {{supportEmail}} {{supportDisplay}} {{supportHours}}
  {{responseTime}} {{operatorName}} {{operatorCR}}

HTML is stripped on save.

API
---
GET  /api/content                         public, published only
GET  /api/admin/content                   admin
PUT  /api/admin/content/site              contact + banner
PUT  /api/admin/content/pages/:slug       save draft
POST /api/admin/content/pages/:slug/publish
POST /api/admin/content/pages/:slug/discard

slugs: terms | privacy | policy | faq
