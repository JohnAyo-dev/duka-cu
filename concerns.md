# Concerns

Open issues, risks and unfinished work tracked for Duka.cu. Ordered most urgent first.

---

## 1. Blocking

### The trust strip on the homepage is currently broken
`index.html` has the dismiss/restore markup (`#trustStrip`, `#trustClose`, `#trustRestore`,
`#trustShow`) but **no CSS and no JavaScript** were ever written for it.

Consequences right now:
- The ✕ button has no styling and sits unstyled inside the strip's flex row, so it visibly
  distorts the layout.
- It does nothing when clicked.
- `#trustRestore` is permanently `hidden` and nothing can ever show it.
- The proposed `localStorage` key `local:duka-trust` was never implemented, so nothing persists.

Along with the sitewide mobile overflow below, this is one of two things that is *visibly* worse
than it should be. Both should be finished or reverted before anything else ships.

### Every page scrolls sideways on a phone (pre-existing, sitewide)
Measured at a 390px viewport, `document.documentElement.scrollWidth` versus `window.innerWidth`:

| Page | scrollWidth | Overflow |
| --- | --- | --- |
| `index.html` | 560 | 170px |
| `profile.html` | 560 | 170px |
| `cart.html`, `sell.html`, `riders.html`, `chat.html`, `product.html` | 615 | 225px |

The cause is `.information` in the header: a single `display:flex` row holding the account link,
Cart, Budget, Chat, "Ride for Duka" and "Sell on Duka", with no wrap and no media query. Every item
is `white-space:nowrap`, and the flex items default to `min-width:auto`, so the row refuses to get
narrower than its own content. The logo and search field then get shoved off the right edge.

This is **not** the same bug as the profile page's overflow, which is now fixed — the profile page
now matches `index.html` exactly at 560px instead of being worse at 653px. The drawer makes this
much easier to live with on every page, since the burger is pinned at the far right, but the page
body itself still scrolls horizontally.

The fix is a header media query: allow `.information` to wrap or scroll at small widths, or hide
the secondary items behind the drawer below ~700px. Because the header is duplicated across three
stylesheets it must be applied three times.

### ~~The collapsible side drawer was never built~~ — RESOLVED
`js/nav.js` now exists and is loaded with `defer` on all nine pages. It mounts its own scrim,
drawer and burger at runtime, so it needs no per-page markup, and the drawer CSS is mirrored into
`base.css`, `index.css` and `budget.css` as originally planned.

The `budget.html` blocker turned out not to matter: the mount point is `.header`, which `budget.html`
does have. It simply has no `.information` block, so the burger lands next to `.header_right`
instead — which is the correct placement for that page.

Built and browser-verified: burger toggle, scrim click, ✕ button, `Escape` to close, `Tab` focus
trap, focus restore to the burger, auto-close above 900px, `is-active` marking, and log out /
delete account actions (both behind double `confirm` and scoped to the three per-device account
keys). `budget.css` was also missing `--banner-bg` in both themes, which the drawer revealed.

### ~~Placeholder page name conflict~~ — RESOLVED
Resolved by renaming rather than by picking a side. `account.html` / `js/pages/account.js` were
replaced with a new `profile.html` / `css/profile.css` / `js/pages/profile.js`, so the drawer gets
its own real Profile destination and the old 82KB dashboard is gone rather than half-merged.
All seven in-repo links to `account.html` were updated, along with the drawer entry, the
`app.js` header fallback and the active entries in `frontend.md`.

### The original mascot dark-mode request was never implemented
The first task in this session. Only investigated: the mascot is an inline base64 PNG, and the
theme uses `data-theme` plus CSS custom properties. No mascot or CSS changes were made.

---

## 2. Sell page — 1 to 6 images

### Six base64 images will exhaust localStorage
`localStorage` is roughly 5MB. Each image is capped at ~120KB of data URL, so a 6-image listing is
~720KB. That is only about 7 listings before the store is full.

`storageSet` in `js/app.js` swallows quota errors, so the failure is **silent**: the listing appears
to save, but on reload it is gone. This degrades to session-only rather than erroring, which makes
it hard to notice.

### The backend cannot store the pictures at all
`listingInput` in `backend/server.js` only keeps `http(s)` URLs and drops data URLs, so every
client-side image is discarded on save. `sell.js` compensates by sending `image: ''` and merging
the local images back onto the response, but the net effect is:

- The picture is only visible on the device that posted it.
- A listing opened on another device or browser shows the stock Unsplash fallback.

A real upload endpoint (object storage) is needed before multi-image is genuinely useful.

### The 1-to-6 rule is client-side only
The server stays deliberately lenient and falls back to the default image when it receives zero
valid URLs. That is forced by the current client behaviour, but it means anything calling
`POST /listings` directly can create a listing with no images. Validation is not enforced at the
trust boundary.

### Images are downscaled on the main thread
`compressPicture` decodes, draws and re-encodes each file synchronously inside a promise. Adding
6 photos blocks the UI thread for a noticeable pause with no progress indication. A worker or
`createImageBitmap` with async encoding would be better.

---

## 3. Chat — requested fixes not yet applied

The request was: make the viewport auto-update, show the last sent message, and allow scrolling to
older messages. Investigation only; **nothing has been changed yet.** What was found:

- `.chat_inbox` uses a hard-coded `height:600px` in `base.css`, overridden on the chat page by
  `height:calc(100vh - 260px)`. It is a fixed guess, and it uses `vh` rather than `dvh`, so it does
  not respond to mobile browser chrome collapsing.
- The same rule adds `min-height:420px`, which on a short viewport forces the inbox taller than the
  screen. The page then scrolls instead of the message list, and the composer can sit off-screen.
- `fillThread` does `bodyEl.scrollTop = bodyEl.scrollHeight` synchronously right after assigning
  `innerHTML`. This is unreliable — if the `bubble-enter` animation or late-loading webfonts change
  the layout afterwards, the last message ends up below the fold.
- `.pd_chat_body` on the product page is capped at `max-height:220px` with no viewport awareness and
  is never scrolled to the bottom, so the newest message is hidden in the product-page chat card.
- `renderAll()` rebuilds the entire thread's `innerHTML` on every send, which throws away the
  scroll position and replays the entry animation on every message rather than just the new one.
- There is no "scroll to latest" affordance, so once a user scrolls up there is no way back except
  dragging the scrollbar.

---

## 4. Payments

### Monnify and Titan are not implemented
Only `payWithPaystack` has a placeholder flow. `payWithMonnify` and `payWithTitan` are
`console.warn` stubs. The cart presents all three as selectable, so a user can pick a method that
silently does nothing.

### The selected payment method is not persisted
`cart.js` keeps the choice in a local variable for the session only. A page reload falls back to
Paystack.

### Amount conversion is convention-only
Paystack is fed naira converted to kobo in the page. Nothing validates the conversion, and the
gateway keys are placeholders.

---

## 5. Codebase fragility

### Stylesheets are hand-synced duplicates
`css/base.css`, `css/index.css` and `css/budget.css` are near-identical copies maintained by hand,
and `index.html` / `budget.html` load *only* their own file. Any new shared component (the drawer,
the new chat rules) must be written three times or it will silently break on whichever page was
missed. This already bit the trust strip and bit the drawer, which had to be written three times.

It bit again while making the display name editable. `.information p` is `white-space:nowrap`, so a
long name was widening the header and pushing `button.nav_burger` past the viewport — measured at
4px of overflow at 1280px wide, and 170px to 225px at 390px. The fix (capping `#accountLabel` with
`max-width` + ellipsis) had to be applied to two files, and `budget.css` was left out because it has
no `.information` block to begin with.

### A bare `1fr` grid track silently floored the whole profile page
`.pf_cols` was `grid-template-columns:1.35fr 1fr`. A bare `1fr` is `minmax(auto, 1fr)`, so the
tracks refuse to shrink below their content's min-content width. Combined with an
`overflow:hidden` + ellipsis product title that had no `min-width:0` parent to shrink into, one long
listing name ("MacBook Air M1 (8GB / 256GB) — Excellent Condition") set a 597px floor and pushed
`document.documentElement.scrollWidth` to 653px on a 390px viewport.

Changed to `minmax(0, 1.35fr) minmax(0, 1fr)`. Worth remembering for every grid in this repo:
**use `minmax(0, 1fr)` whenever a track holds truncatable or free-form text.** `min-width:0` on the
flex/grid child alone is not enough if the track itself floors at `auto`.

### The test suite has no isolated store, so it only passes once
`backend/tests/api.test.js` creates its server with `createServer()` and no store override, so it
reads and writes the real `backend/data/store.json`. The fixtures use fixed emails
(`ada@stu.cu.edu.ng`, `seller-x@stu.cu.edu.ng`, `buyer-y@stu.cu.edu.ng`), so:

- First run: 4/4 pass.
- Any second run: `registration` fails with `409 !== 201` because `ada@stu.cu.edu.ng` already
  exists, and the next test dies with `TypeError: Cannot read properties of undefined (reading
  'token')` because `register()` returns `r.body.data` from a 409 body.

This is pre-existing and is not caused by the frontend work. `store.json` is gitignored, so a fresh
clone passes and a push is unaffected — but on a machine with an existing store `npm test` always
reports 2 failures, which is alarming and easy to misread as a regression. The fix is to let the
tests point `createServer()` at a temp store.

### No tests and no browser verification
**Backend:** `npm test` exists and passes 4/4 on a fresh store (see the isolation issue above).

**Frontend:** still no automated coverage. The profile page and the drawer were verified by
hand-driven Playwright scripts, which is how the two overflow bugs above were found — but those
scripts live in the OS temp directory, not the repo, so nothing re-runs them. A 390px overflow on
every page in the site is still present and unfixed (see below).

### Inline `onclick` handlers throughout
`chat.js` and `chat.js`-adjacent templates rely on inline `onclick="chatOpen('...')"`. These cannot
work under a strict Content-Security-Policy and are being deprecated by browsers.

### `listingId` is interpolated into an inline handler attribute
In `renderList`, `data-lid` and the `onclick` argument are built with string concatenation. Locally
generated ids are safe (`'l' + Date.now()`), but ids that arrive from the backend are not escaped,
so a hostile or malformed id could break out of the attribute.

### `sellerOf` can throw a ReferenceError
`var all = window.listings || listings || []` falls back to a bare `listings` identifier. If
`app.js` ever fails to define it, this throws rather than returning an empty list.

### The mascot is an inline base64 blob on every page
Large `data:image/png` URIs are duplicated into each HTML file rather than loaded as an asset. It
bloats every page, and it is why restyling the mascot for dark mode was awkward — there is no
single source of truth to edit.

### Massive duplicated `img` base64 in JS render functions
`chat.js` and `index.js` / `product.js` embed multi-kilobyte image strings directly in the
JavaScript source. This is unmaintainable and bloats the JS bundles.
