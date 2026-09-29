Duka.cu — What is left to do
Status per item: [done] verified in code and tests, [partial] some of it is
done (what is done and what is left is spelled out), [todo] not started, and
[needs you] cannot be finished from inside the code (credentials, accounts,
hosting or a decision).

===================================================================
BACKEND
===================================================================

1. Production database [todo]
   Migrate from backend/data/store.json to PostgreSQL with migrations,
   indexes and automated backups. Everything below still writes to the JSON
   file; a second server instance would not share it (this also means the
   in-memory rate limiter is per process).

2. Payment verification [partial]
   Done: POST /api/v1/webhooks/paystack checks Paystack's HMAC-SHA512
   signature over the raw body, matches the reference to an order, checks the
   amount against what the server priced, moves the order to "paid" exactly
   once, and increments each listing's "sold" count. A paid order cannot be
   cancelled; a late payment cannot revive a cancelled order. Unpaid orders can
   be cancelled (POST /orders/:id/cancel). Covered by tests with a signed body.
   Left: the Monnify webhook (same idea, its own signature scheme), inventory
   reservation while an order is pending, refunds, and confirming the flow
   against real Paystack once keys exist [needs you: Paystack keys].

3. Delivery fees on orders [done]
   Orders now carry subtotal, deliveryFee and total, all computed on the
   server. Rule (mirrored in js/app.js for display): only listings set to Duka
   delivery are charged; N500 if the order has food delivered, N2500 if it has
   anything else delivered, both if mixed (N3000). Prices from the browser are
   ignored.

4. Listing moderation and safety [partial]
   Done: POST /listings/:id/report (one report per person, not your own
   listing), an append-only audit log (listing created/deleted, orders,
   payments, reports, rider decisions), a cap on active listings per account,
   and rate limiting on sign-in and on all writes.
   Left: an approval workflow, a way for staff to read and act on reports
   (there is no admin UI), seller verification (the verified flag is still
   hardcoded false on real listings) and content moderation.

5. Image storage [todo]
   Needs managed object storage, so it is [needs you: a bucket and a
   provider]. The API still accepts only http(s) image URLs.

6. Account and budget integration [done]
   GET/PUT /me/preferences (theme, privacy switches, preferred payment method)
   and GET/PUT /me/budget, validated and stored per account. Profile endpoints
   already existed.

7. Chat completion [partial]
   Done: unread counts per conversation and in total, POST
   /conversations/:id/read, a last-message preview, GET /conversations/:id, and
   ?include=messages on the list.
   Left: message content moderation.

8. Rider and delivery workflows [partial]
   Done: POST /riders/applications (one open application per account), GET
   /riders/applications/me, and admin approve/reject (PATCH, admins named in
   ADMIN_EMAILS).
   Left: order assignment, package tracking, delivery status updates.

9. Production operations [partial]
   Done: .env loading (backend/env.js), rate limiting, one-line JSON request
   logs, a public-config endpoint, the site served from the same process, and
   a larger test suite (see claude.md for the current count).
   Left: monitoring and alerting, deployment config and HTTPS [needs you:
   hosting], automated backups, a shared rate-limit store for multi-instance.

===================================================================
FRONTEND
===================================================================

1. Extend the API client (js/api.js) [done]
   Listings (incl. delete and report), orders, config, conversations,
   messages, mark-read, preferences, budget, riders and feedback. Logging out
   now clears the session token. The offline fallback still exists for the
   marketplace, cart and chat; anything that needs the server (orders,
   payments, saved preferences) says so instead of pretending.

2. Cart and order integration [partial]
   Done: the cart shows the delivery fee, checkout creates a server order,
   opens Paystack for that order's reference, waits for the webhook to mark it
   paid, then clears the cart. Purchase History (Settings) lists the orders.
   Left: a receipt page per order. Sample listings that ship with the site are
   not on the server, so they cannot be paid for; that is stated on the cart.

3. Real payment keys and flow [needs you]
   The placeholder key is gone; the public key now comes from the server
   (PAYSTACK_PUBLIC_KEY). Until keys are set, checkout says payment is not
   switched on and creates nothing. Monnify is not wired.

4. Sign-in / sign-up UI [done]
   login.html: buyer/seller question first when creating an account, email
   and password, Google/Apple/Facebook buttons that are only enabled when the
   server has their credentials, a clear "already signed in" state, and proper
   logout. Google and Apple themselves are [needs you: developer accounts and
   keys]; see claude.md.

5. Chat integration [todo]
   chat.js is still browser-storage with seeded demo conversations. Point it at
   /api/v1/conversations (the backend side is ready), sync unread badges and
   remove the fake read ticks.

6. Seller tools on the sell flow [partial]
   Done: owners can delete their own listing from its page; other signed-in
   users can report it.
   Left: real image upload [needs you: storage, see backend 5] and editing a
   listing.

7. Budget persistence [partial]
   Done: saved on the device and, when signed in, to the account.
   Left: budget.js still has its own copy of the theme toggle instead of the
   shared helper.

8. Rider application flow [done]
   riders.html submits to the API, is sent through sign-in first if needed, and
   shows the pending / approved / rejected state when you come back.

===================================================================
NEW ITEMS FOUND WHILE DOING THIS
===================================================================

- Listing text was inserted into the page as raw HTML on the marketplace cards,
  the product page and the cart. [done] It is escaped everywhere now.
- The Delete Account menu item only clears this device and signs out; there is
  no server endpoint that deletes the account itself [todo].
- The sample listings include phone numbers and school emails in the style of
  real students. Check that all of them are made up [needs you].
- css/base.css, css/index.css and css/budget.css each carry their own copy of
  the header/drawer rules. New shared rules live in css/shell.css; merging the
  three is still [todo].

===================================================================
DONE ALREADY
===================================================================

- Backend: health endpoint, validated listing CRUD + ownership, cart,
  server-computed orders, listing-scoped conversations + messages, file-backed
  dev store, CORS, request-size limits, authentication (register / login /
  logout / me, scrypt hashing, bearer sessions), OAuth code flow for Google,
  Apple and Facebook.
- Frontend: listings load/create wired to the API with localStorage fallback;
  CSS/JS extracted to external files; theme, cart badge, chat badge shell;
  auth methods and bearer-token handling in js/api.js.
