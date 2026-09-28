# Landing page: social previews, SEO, cold start, and a real overflow bug

**Rebuilt against `main @ ba19e93`** — your latest. The earlier cut targeted
`d139fb4`; since then you pushed five commits (the listing-tabs work), one of
which touched a file this change also touches. Details under *Rebase* below.

11 files, 452 insertions, 14 deletions.

```bash
git apply seo-landing.patch
```

Then one environment variable in Netlify:

```
API_URL = https://sokoni-hub.onrender.com
```

Both edge functions **no-op safely without it**, so a deploy that forgets it
behaves exactly as today rather than breaking. If your domain is not
`sokonihub.com`, change it in `index.html` and the two edge functions.

---

## Rebase — what I actually had to redo

Of the seven files I modify, six were untouched between `d139fb4` and
`ba19e93`, so those carried over unchanged.

**`web/src/styles.css` did move** — your listing-tabs work added 58 lines to
it. I re-applied the `.tip-end` block onto the new file rather than copying my
older copy over the top, which would have silently reverted `.ld-tabs`,
`.ld-panel` and `.rv-compose`.

Verified rather than assumed: the tabs rules are still present in the patched
file, and the full tabs + composer browser suite passes on the rebuilt tree —
32 assertions, including the inline composer posting a review and the tab count
updating live.

---

## 1. Social previews — the one actively costing you growth

There was not a single `og:` tag in the codebase. Every link a vendor shared
rendered as a naked blue URL.

Your pitch is *"sell beyond WhatsApp status"*, so WhatsApp **is** the
distribution channel. The part that makes this structural rather than cosmetic:
**WhatsApp, Facebook and X scrapers do not execute JavaScript.** For a Vite SPA
the only thing they will ever read is `index.html`. Setting `<head>` from React
does nothing for them — which is why the fix cannot live in React.

**Site-wide tags in `index.html`** — `og:*`, `twitter:*`, canonical,
`theme-color`, and a JSON-LD graph with an `Organization` plus a `WebSite`
`SearchAction` (what can give you a search box in Google results). Plus a
1200×630 share card generated from your own logo and brand colours — indigo
`#2E3B6E`, gold rule, 91 KB.

**Per-page tags at the edge** — `netlify/edge-functions/social-preview.ts`
intercepts `/listing/*` and `/store/*`, fetches the real record and rewrites the
tags server-side, so a shared product link shows its own photo, title and price.
It also emits `Product` / `Service` / `Store` schema, including
`aggregateRating` **only when reviews actually exist** — fabricating that is
both a Google penalty and a lie to the buyer.

Deliberately narrow: only crawler user-agents are rewritten, so humans get the
untouched SPA; and **any** failure — no `API_URL`, timeout, unknown id,
non-HTML response — falls through to the original page. A broken preview is a
bad day; a broken product page is worse.

`robots.txt` and a `/sitemap.xml` generated at the edge from live listings
complete it. Generated rather than committed because a marketplace's URLs *are*
its listings; a static file is stale the next day, which teaches the crawler not
to re-read it. If the API is down it still serves the static routes.

---

## 2. Launch day no longer shows zeros

The hero counters rendered `0 Live listings · 0 Verified stores · 0 Cities`
until you had data — and `/meta/stats` is wrapped in `.catch(() => {})`, so a
failed call would have pinned those zeros there permanently.

The row is now built from whatever is non-zero and **is not rendered at all**
when nothing is.

The pill was worse: `{stats.vendors || 'Dozens of'} verified stores` — with three
stores it read *"Dozens of verified stores"*, a claim the page cannot support. It
now says **"Every store checked by hand"** until there are at least five, then
quotes the real number.

Proven with a stubbed API at 0, 3 and 42 stores — see `hero-coldstart.png`.

---

## 3. A 23px horizontal scroll on every page, at tablet widths

I had isolated this as "pre-existing, not my feature" and left it. It was worth
chasing.

Between roughly 700px and 900px the whole document scrolled sideways by 23px.
Several element sweeps found **nothing** — every candidate was inside the
viewport or clipped by an ancestor.

The culprit was a **`::after` tooltip**. `getBoundingClientRect` does not see
pseudo-elements, which is why it survived every scan; but an absolutely
positioned `::after` still contributes to the document's scrollable area, even
at `opacity: 0`. The `.tip` on the theme toggle is centred with
`white-space: nowrap`, and that control sits against the right edge.

Fixed by anchoring tooltips on trailing controls to the right instead of the
centre (`.tip-end`), which keeps the whole tooltip visible — `overflow: hidden`
on the header would have clipped it. Applied to the theme toggle and the two
dashboard controls with the same problem.

Verified: **6 routes × 3 widths, zero overflow anywhere.** It was wrong on every
page before, not just the landing page.

---

## 4. Performance

- `logo.png` **239 KB → 135 KB** (683px wide for a 36px slot).
- Hero image now declares `width`/`height`, so the copy beside it stops jumping
  when the image lands, plus `fetchpriority="high"` — it is the LCP element and
  the browser was treating it as decorative.
- Google Fonts no longer blocks first paint (`media="print"` + `onload`, with a
  `<noscript>` fallback). The page renders in the fallback stack and swaps,
  instead of showing nothing until Google answers — which matters on a
  mid-range Android over Qatari mobile data.

---

## Verification, all re-run on `ba19e93`

| Suite | Result | What |
|---|---|---|
| `t_social.mjs` | **41/41** | the real injector over the **real built `index.html`** |
| `t_coldstart.js` | **11/11** | hero at 0 / 3 / 42 stores, stubbed API |
| `ovf_all.js` | **18/18** | 6 routes × 3 widths, no horizontal overflow |
| `t_tabs_ui.js` | **32/32** | your tabs + composer still work after the styles.css rebase |

Plus `tsc --noEmit` clean and `vite build` clean — and separately, the patch was
applied to a **pristine clone of `ba19e93`**, which then typechecked and built,
producing `dist/og-image.png`, `dist/robots.txt` and the meta tags.

The social tests are the ones I would not otherwise trust: it is string surgery
on markup, so they run against the actual built file and check that tags are
**replaced, not appended** (duplicates are exactly why scrapers disagree), that a
listing photo does not inherit the 1200×630 dimension hints, and that a title
containing `<script>` and quotes cannot break out of the attribute.

### Not verified

The edge functions have **not run on Netlify**. I tested the pure logic against
the built HTML, not the Deno runtime or the path routing — the first deploy is
where a config-level mistake would surface. Once live:

```bash
curl -A 'WhatsApp/2.23' https://sokonihub.com/listing/<id> | grep 'og:image'
curl https://sokonihub.com/sitemap.xml | head
```

Also unverified: nothing has run against live Supabase or Render, and the
`og:image` URLs assume the `sokonihub.com` domain.

---

## Still outstanding from my original review

- Emoji category icons render inconsistently across Android, iOS and Windows.
- Arabic / RTL remains unconsidered, which in Qatar is worth a decision.
- ("How it works" and the hero city selector are both in already.)
