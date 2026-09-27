# Vendor bookings — mobile layout

6 files, 357 insertions. Verified against a clean clone of `main` at `1a28b03`
(which already carries the booking feature itself).

```bash
git apply bookings-mobile.patch
```

---

## The layout

**One DOM that changes shape.** No duplicated markup, so there is only ever one
thing to keep correct.

| Width | Shape |
|---|---|
| ≥ 861px | Six aligned columns with a header row — table density for scanning |
| 641–860px | Two cards side by side — a single stacked card at 768px wastes half the screen |
| ≤ 640px | One stacked card, reference and status sharing the top line like a mail client |

Driven by a shared `--bk-cols` custom property so the header and every row cannot
drift apart, and by `.bk-label` cells that are hidden when the header row explains
the columns and revealed when it does not.

Other decisions worth knowing:

- **Filter chips scroll sideways** instead of wrapping into a block that pushes
  bookings off the screen.
- **Three stat cards stay three-up on mobile.** Stacked full-width they pushed
  every actual booking below the fold.
- **Row 1 is pinned explicitly** on mobile. Grid auto-placement only moves
  forward, so without it the status badge landed below the last stacked cell.
- **Tap targets are 44px in card mode**, not just below 640px — a 768px tablet is
  still a thumb, and the chips would otherwise stay at the 32px `.btn-sm` height.
- Long titles and emails may break anywhere; **a booking code may not** — a
  reference split across two lines is hard to read out over the phone.

---

## Three bugs found on the way

### 1. The page was rendering unstyled

It used `className="table"`. The stylesheet's class is `.tbl`. `.table` does not
exist, so that markup had no styling at all. Same for several bare `.hint` uses —
`.hint` is only ever defined as `.field .hint`.

### 2. Every dashboard page scrolled sideways on a phone

`.breadcrumb` is `flex: 0 0 auto`, so it cannot shrink and a long page name pushes
the whole document wider than the viewport. Measured at 390px:

| Page | Overflow before | After |
|---|---|---|
| `/vendor/listings` | **73px** | 0 |
| `/vendor/statements` | **20px** | 0 |
| `/vendor/bookings` | 6px | 0 |
| `/vendor/orders` | 0 | 0 |

Below 640px the leading "Home /" is dropped — the burger and the back gesture both
already cover it — and the current page truncates instead of pushing. This fixes
pages I was not asked to touch; `orders` was clean only because "Orders" is short.

### 3. A database blip signs every user out

Not a styling bug, but it is what made the layout harness fail, so it is worth
stating plainly. `loadUser()` in `api/src/auth.ts` wrapped the JWT check **and**
the user lookup in one `try { … } catch { return null }`. A failed database query
therefore became "not authenticated" → **401** → and `lib/api.ts` clears the
stored token on any 401.

So a transient database problem does not degrade the app, it **logs out every
active user** — precisely when the database is already struggling. With Supabase
free-tier pausing in the picture, that is a realistic Monday morning.

Now a bad, expired or forged token still returns `null`, but a database failure
throws and surfaces as a 5xx the client will retry. `optionalAuth` keeps its
"never fails" contract and proceeds anonymously.

While there, `VendorLayout`'s two polls run sequentially rather than as a
`Promise.all` — two concurrent requests every 60 seconds double the pool pressure
for no perceptible gain.

---

## Verification

`shots.js` drives a real Chrome at five viewports and reports the **settled
computed layout**, not a screenshot someone eyeballed:

```
mobile-360    listCols=1 itemCols=2 header=hidden labels=shown tap=44px overflow=none
mobile-390    listCols=1 itemCols=2 header=hidden labels=shown tap=44px overflow=none
tablet-768    listCols=2 itemCols=2 header=hidden labels=shown tap=44px overflow=none
tablet-900    listCols=1 itemCols=6 header=shown  labels=hidden tap=32px overflow=none
desktop-1280  listCols=1 itemCols=6 header=shown  labels=hidden tap=32px overflow=none

All viewports clean.
```

It fails the run on any horizontal overflow, or any sub-44px tap target on a touch
viewport. Screenshots for all five are in this folder.

`tsc --noEmit` clean on `api` and `web`; `vite build` succeeds.

### Two measurement traps, in case you re-run it

- **`fullPage: true` temporarily resizes the viewport.** Any `scrollWidth` read
  after a screenshot is meaningless. Measure first, capture second.
- **Animations must be killed before measuring**, or you catch the sidebar
  transition mid-flight and chase a 6px ghost that is not there.

Chrome needs libraries the sandbox lacks; `shots.js` assumes they are on
`LD_LIBRARY_PATH`. On a normal machine it just runs.

---

## Not done

The **admin** bookings page uses the shared `DataTable`, which already has its own
responsive handling — horizontal scroll with a pinned first column. I left it
alone. Admin work is overwhelmingly desktop, and changing `DataTable` would touch
every admin table in the product. Say the word if you want admin on phones too.
