# claude.md — work log for Duka.cu

Everything done in this session, why, and how it was checked. Read the
"Needs you" section first: a few things cannot work until you supply accounts
or keys.

## Run it

```
npm start            # then open http://localhost:3000
npm test             # 31 backend tests
```

`npm start` now serves the pages **and** the API from one address, so there is
no CORS, no second port, and no editor "live reload" watching the file the
server writes to. Only `*.html` in the project root plus `css/` and `js/` are
served; `backend/`, `.env`, `.git` and the markdown files are not (tested,
including `..` and encoded-slash tricks).

If you still use VS Code Live Server, `.vscode/settings.json` now tells it to
ignore `backend/**` (a data-file write there triggers a page reload).

## Your 13 requests

| # | Request | What was done | Where |
|---|---|---|---|
| 1 | Ask buyer or seller first | "Create account" opens with **"First, what brings you to Duka.cu?"** (buyer / seller cards). The form and the Google/Apple buttons only appear after choosing; a "Signing up as a … Change" chip lets you go back. The choice is saved on the account (`role`), and a new seller lands on `sell.html`. It is asked on sign-up, not on sign-in. Settings has an "I mainly want to" control for people who came in through Google/Apple without answering. | `login.html`, `js/pages/login.js`, `backend/server.js` |
| 2 | Sign-in/create account loads then reloads | **Cause found and reproduced:** *Log out* never removed the session token, so `login.html` saw the old token, confirmed it, and instantly redirected away — the form appeared and vanished. Fixes: logout now clears the token (and tells the server); an already-signed-in visitor sees "You're already signed in — Continue / Sign out and use a different account" instead of a silent redirect; redirects are relative so they work from any folder; the site is served by the backend (see Run it). I could **not** reproduce a reload on sign-up itself in a clean session, so if you still see one, tell me how you open the site (Live Server, double-click, `npm start`). | `js/nav.js`, `js/api.js`, `js/pages/login.js`, `backend/server.js`, `.vscode/settings.json` |
| 3 | Remove Kunle Adeyemi | "Adeyemi" appears nowhere in the code; the only match was the seller **Kunle** on listing `l6` (Beef Suya), which carried a phone number, Snap handle and school email. The whole listing is removed, and `l6` is filtered out of anything a browser cached earlier. See "Decisions" if you meant something else. | `js/app.js` |
| 4 | Mascot in dark mode | The black outline/cap/shoes vanished on the dark background. Dark mode now draws a thin light "sticker" outline around every mascot instance (logo, hero, rider banner, footer, cards, empty states). Light mode is untouched. Also: the hero mascot no longer rests on top of the "Sort by" dropdown, and it drops below the menu drawer while the menu is open. | `css/shell.css` |
| 5 | Make create account and sign in work | Verified end to end in a real browser (register, log out, sign in, wrong password message, switch account). | `/tmp`-style Playwright run, see Verification |
| 6 | Apple and Google account creation | **The code path is complete and tested against a mock Google and Apple; it cannot work for real until you create the developer credentials** (see "Needs you"). A real bug was found and fixed on the way: Apple posts its result as a form, and the server parsed it as JSON, so Apple sign-in could never have completed. | `backend/server.js`, `backend/tests/oauth.test.js` |
| 7 | Favicon on the account page | `login.html` had `data:image/png;base64,` written twice in the icon URL, so it was broken. It now uses the same icon as every other page. | `login.html` |
| 8 | Real icons in the hamburger menu | The emojis (and ✕) are replaced by hand-drawn inline SVG icons (`currentColor`, follow the theme). | `js/nav.js`, `css/shell.css` |
| 9 | Add Settings, Privacy Settings, Search History, Payment Information, Feedback | These five entries already existed in the menu, but every page behind them said "Not wired up yet". They are now real: **Settings** (appearance, buy/sell focus), **Privacy** (remember searches; pre-fill my email when selling), **Search History** (list, click to search again, clear), **Purchase History** (real orders), **Payment Information** (preferred method, never stores card numbers), **Feedback** (sent to the server). Preferences sync to the account when signed in. The menu is grouped: Profile / Budget / Ride for Duka, then Settings … Feedback, then Log out / Delete. | `settings.html`, `js/pages/settings.js`, `js/nav.js` |
| 10 | Declutter the navbar | Removed the duplicate "Sign in" + "Profile" (one entry: your name, or "Sign in") and removed Budget and Ride for Duka (both are in the menu). Left: search, theme, account, Cart, Chat, Sell on Duka. | all `*.html`, `js/app.js` |
| 11 | ✕ on the verification/payment banner removes the banner div | The × had no code behind it. It now removes `#trustStrip` and its "show again" bar from the DOM and remembers that on this device. | `js/pages/index.js` |
| 12 | Do what you can in `ToDo.md` | See "ToDo items" below and `ToDo.md`. | |
| 13 | This file | — | `claude.md` |

## ToDo items done

Backend: server-calculated **delivery fees**; **Paystack webhook** verification
(HMAC-SHA512, amount check, paid exactly once, `sold` count); order cancel;
**listing reports**, **audit log**, listing cap per account; **rate limiting**
and JSON request logging; **`.env` loading**; **preferences** and **budget**
endpoints; **chat unread counts**, mark-read, last-message preview; **rider
applications** with admin review (`ADMIN_EMAILS`); **feedback** endpoint;
buyer/seller **role**; `GET /config` for the public Paystack key.

Frontend: full API client; cart with delivery-fee breakdown and a real
checkout flow (creates a server order, opens Paystack, waits for the webhook);
budget persistence (device + account); rider application submit + status;
delete-own-listing and report-a-listing on the product page.

Not done (and why) is spelled out per item in `ToDo.md`. In short: PostgreSQL,
image storage, Monnify, chat page integration, listing editing, monitoring and
hosting.

## Security bugs found and fixed

1. **Stored XSS.** Listing title, seller name, description, phone, Snap, email
   and condition were put into `innerHTML` raw on the marketplace cards, the
   product page and the cart. Any student could post a listing that ran script
   in every visitor's browser — where the login token lives. All of it is
   escaped now (`escapeHtml` in `js/app.js`); tested with a hostile listing
   posted by a second account.
2. **Logout didn't log out** (above).
3. **Apple callback** couldn't read Apple's form post (above).
4. Delete Account clears this device and signs out but does **not** delete the
   server account (no such endpoint yet — listed in `ToDo.md`).

## Needs you

**Google sign-in** (about 10 minutes, free)
1. console.cloud.google.com → create a project → *APIs & Services* → *OAuth consent screen* (External; add yourself as a test user while it is in testing).
2. *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*.
3. Authorised redirect URI: `http://localhost:3000/api/v1/auth/oauth/google/callback` (must match exactly; use `localhost`, not `127.0.0.1`).
4. Copy the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, restart `npm start`. The Google button on the sign-in page turns on by itself.

**Apple sign-in** (paid Apple Developer account, US$99/year)
Apple does not accept `localhost` or `http://`, so this needs a real domain over
HTTPS (a deployed site, or a tunnel such as Cloudflare Tunnel / ngrok while testing).
1. developer.apple.com → *Certificates, Identifiers & Profiles* → *Identifiers*: register an **App ID** with *Sign in with Apple*, then a **Services ID** — that identifier is `APPLE_SERVICE_ID`.
2. Configure the Services ID: your domain, and return URL `https://<your-domain>/api/v1/auth/oauth/apple/callback`.
3. *Keys* → new key with *Sign in with Apple* → download the `.p8` once → `APPLE_KEY_ID` is on the key page, `APPLE_PRIVATE_KEY` is the file's contents.
4. `APPLE_TEAM_ID` is shown at the top right of the developer portal.
5. Set `PUBLIC_URL=https://<your-domain>` in `.env` too.

**Payments**
Create a Paystack account, put the public and secret keys in `.env`
(`PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`) and set the dashboard webhook to
`https://<your-domain>/api/v1/webhooks/paystack` (Paystack must be able to
reach it, so use a tunnel while testing). Until then, checkout says payment is
not switched on and creates nothing. The signed-webhook logic is tested, but
**not against real Paystack**.

**Admins:** set `ADMIN_EMAILS=you@stu.cu.edu.ng` to be able to approve riders.

## Decisions I made that you may want to reverse

- **Kunle:** I removed the whole Beef Suya listing rather than keep it under an invented seller. To put it back, re-add the `l6` line in `js/app.js` and delete `'l6'` from `REMOVED_LISTING_IDS`.
- **Buyer/seller question** is asked when creating an account, not on every visit or sign-in.
- **Delivery fee rule** was inferred from the existing UI text: flat per order and per class of goods, only for Duka-delivery listings.
- **Profile stats** ("buys", "spend") now count only *paid* orders.
- **Banner ×** remembers the dismissal on the device; there is no "show again".
- `PUBLIC_URL` now defaults to `http://localhost:3000` and `APP_URL` to the same address.

## Verification

- `npm test` — 31 tests pass: the original 8 plus features (fees, webhook, reports, feedback, preferences, budget, riders, chat, roles), rate limiting, OAuth against a local mock provider (Google and Apple, state/code single use, Apple signed client secret, wrong-audience token refused), `.env` parsing, and static-serving path traversal. The webhook test was checked by breaking the signature check on purpose and confirming it fails.
- 51 browser checks (headless Chromium, real server, fresh data store) passed: the whole list above, plus injection, cart fee, settings, budget restore from the account after wiping the local copy, riders. Screenshots were reviewed for dark-mode mascot, navbar, menu icons and the role step; that caught three visual bugs (chip visible on the wrong step, brand link styled as a default link, mascot floating over the open menu), all fixed. The browser suite is not in the repo.
- **Not verified:** real Google, Apple or Paystack (no credentials); Live Server behaviour; any device other than headless desktop/mobile Chromium.

## Files

New: `backend/env.js`, `backend/tests/{features,oauth,ratelimit,static}.test.js`,
`css/shell.css`, `js/pages/settings.js`, `.vscode/settings.json`, `claude.md`.
Rewritten: `js/api.js`, `js/pages/login.js`, `ToDo.md`, `.env.example`.
Edited: `backend/server.js`, `js/app.js`, `js/nav.js`, `js/pages/{index,cart,product,budget,riders,sell}.js`,
`login.html`, `settings.html`, `budget.html`, and the header of every page.
Note: `css/base.css`, `css/index.css` and `css/budget.css` still each carry their
own copy of the header/menu rules; new shared rules live in `css/shell.css`.
