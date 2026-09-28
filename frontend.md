# Frontend — Work Log

This file documents all work done on the Duka.cu frontend in this session.

## Task

Separate all inline CSS and JavaScript from the HTML of every page in this project
(`profile.html`, `budget.html`, `cart.html`, `chat.html`, `index.html`, `product.html`,
`riders.html`, `sell.html`), moving them into dedicated external files.

## What was found

Before the change, every HTML file contained its `<style>` and `<script>` blocks inline.
Closer inspection showed that a lot of the inline code was **identical across pages**:

- A theme bootstrap script (400 chars) — present in all 8 files.
- A shared "Duka.cu shared app logic" script (~24,500 chars) — present in 7 files
  (all except `budget.html`).
- A shared "Duka.cu campus chat" script (~116,400 chars) — present in all 8 files.
- A shared base stylesheet (~36,300 chars) — identical in 6 files
  (all except `index.html` and `budget.html`).
- Page-specific styles and scripts — present in each file as their remaining blocks.
  `index.html` also had its own scroll build/destroy script.

## What was done

### 1. Created new folders

- `css/` — shared and page stylesheets.
- `js/` — shared scripts.
- `js/pages/` — scripts unique to a single page.

### 2. Extracted CSS into `css/`

| File | Source | Notes |
|------|--------|-------|
| `css/base.css` | shared inline `<style>` in account/cart/chat/product/riders/sell | Identical 36,345-char block shared by 6 pages |
| `css/index.css` | `index.html` inline `<style>` | Index page differs slightly (mascot drag styles) |
| `css/budget.css` | `budget.html` inline `<style>` | Budget pages have their own smaller stylesheet |
| `css/chat.css` | `chat.html` extra inline `<style>` (185 chars) | Loaded after `base.css` on chat only |
| `css/product.css` | `product.html` extra inline `<style>` (~4,076 chars) | Loaded after `base.css` on product only |

### 3. Extracted JS into `js/`

| File | Source | Loaded on |
|------|--------|-----------|
| `js/theme.js` | theme bootstrap block (identical in all files) | all 8 pages |
| `js/app.js` | shared app logic block (identical in 7 files) | all pages except `budget.html` |
| `js/chat.js` | shared campus-chat logic block (identical in 8 files) | all 8 pages |
| `js/scroll.js` | index-only scroll build/destroy block | `index.html` only |
| `js/pages/profile.js` | profile page script | `profile.html` |
| `js/pages/budget.js` | budget page script | `budget.html` |
| `js/pages/cart.js` | cart page script | `cart.html` |
| `js/pages/chat.js` | chat page bootstrap script | `chat.html` |
| `js/pages/index.js` | index page script | `index.html` |
| `js/pages/product.js` | product page script | `product.html` |
| `js/pages/riders.js` | riders page script | `riders.html` |
| `js/pages/sell.js` | sell page script | `sell.html` |

### 4. Rewrote the 8 HTML files

Each file now references the external files instead of containing inline code:

- In `<head>`: `<script src="js/theme.js"></script>` is loaded **first** (synchronously,
  no `defer`/`async`), followed by the stylesheet `<link>`s and the page favicon.
  Keeping the theme script synchronous before the CSS preserves the no-flash theme behavior.
- Before `</body>`: `<script src="js/app.js"></script>`, `<script src="js/chat.js"></script>`,
  then the page script `<script src="js/pages/xxx.js"></script>` — preserving the original
  inline load order exactly. `index.html` additionally loads `js/scroll.js` before `js/app.js`.

## Verification

- Confirmed byte-identical shared blocks across pages (theme, app, chat scripts and base CSS)
  before extracting, so a single shared file reproduces identical behavior.
- After the rewrite, a pointer-and-check pass confirmed:
  - Zero inline `<style>` or inline `<script>` blocks remain in any HTML file.
  - Every `<link>`/`<script src>` points to a file that exists.
  - Link/script counts per page match the original block counts
    (e.g. `index.html`: 1 CSS + 5 JS; `chat.html`: 2 CSS + 4 JS; `budget.html`: 1 CSS + 2 JS).
- Reconstructed the inline version from the new HTML + external files and re-hashed each
  block, confirming all blocks match the pre-rewrite content (only the theme/highly-ASCII
  blocks matched the earlier hashes; the rest were re-validated against the correct UTF-8
  source because the first hash pass used the ANSI-decoded text).
- All files are UTF-8 (no BOM), same as the originals.

## Result

The HTML files shrank dramatically (e.g. `account.html` 260,887 → 82,540 bytes;
`index.html` 360,097 → 160,253 bytes) and all styles/scripts live in the `css/` and `js/`
folders. No markup, styling, or behavior was changed.

## Addendum: authentication support in `js/api.js`

The shared API client now carries the session token and exposes account methods.
The header object sends `Authorization: Bearer <token>` whenever a token is
stored (key `local:duka-api-token`), alongside the legacy `x-user-id` header so
pages keep working during migration. Methods added to `window.DukaApi`:

- `register({ name, email, password })` → `POST /api/v1/auth/register`; stores the returned token.
- `login({ email, password })` → `POST /api/v1/auth/login`; stores the returned token.
- `logout()` → `POST /api/v1/auth/logout`; clears the stored token.
- `me()` → `GET /api/v1/auth/me`; returns the authenticated user profile.

No page consumes these methods yet; wiring the sign-in/sign-up flow is a
separate frontend task (see `ToDO`).