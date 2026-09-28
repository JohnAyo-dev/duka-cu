Duka.cu — What is left to do
Status per item is [done] (verified in code) or [todo] (still missing).

===================================================================
BACKEND
===================================================================

1. Production database [todo]
   Required before auth, payments, and accounts can be reliable. Migrate
   from backend/data/store.json to PostgreSQL with migrations, indexes,
   and automated backups.

2. Payment verification [todo]
   Money-critical core of the marketplace. Add server-side
   Paystack/Monnify webhook verification before treating orders as paid.
   Orders are currently created as draft "pending_payment" with no way to
   transition to paid/fulfilled, no inventory reservation, and no decrement
   of the listing "sold" count.

3. Delivery fees on orders [todo]
   Money-correctness fix: order totals (backend orderTotal) sum item prices
   only, while the UI advertises flat delivery fees (N500 food, N2500
   everything else). Add a server-calculated delivery fee line so totals
   match what buyers see.

4. Listing moderation and safety [todo]
   Do before real users arrive: reporting, approval workflows (new listings
   are auto-'active'), seller verification (verified flag is hardcoded
   false), audit logs, and abuse protection (flood/spam controls).

5. Image storage [todo]
   Core seller experience. Add an upload endpoint and managed object
   storage with file-type validation and size limits. Today the API only
   accepts http(s) image URLs, so the sell form's captured picture is
   dropped and a placeholder URL is stored instead.

6. Account and budget integration [todo]
   No endpoints exist for user profiles, preferences, budgets, or
   spending. Persist account.html and budget.html data server-side per user.

7. Chat completion [todo]
   Builds on existing endpoints: add unread counts and a mark-read
   endpoint, last-message preview in the conversation list, and message
   content moderation.

8. Rider and delivery workflows [todo]
   Fulfilment beyond MVP. No backend exists for the riders.html application.
   Add rider onboarding, verification/approval, order assignment, package
   tracking, and delivery status updates.

9. Production operations [todo]
   Final hardening before launch: rate limiting, structured logging,
   monitoring/alerting, deployment configuration, HTTPS, env file loading
   (server reads process.env only), automated backups, and a broader test
   suite (currently 4 tests).

===================================================================
FRONTEND
===================================================================

1. Extend the API client (js/api.js) [todo]
   Prerequisite for every other frontend integration. Auth methods
   (register/login/logout/me) and bearer-token handling are done. Add cart,
   order, conversation, message, and account methods while keeping the
   offline fallback for each.

2. Cart and order integration [todo]
   Core conversion path: cart.html still uses localStorage. On checkout,
   create a server order (js/api.js has no order call today), include
   delivery fees, and show the order status/receipt instead of only opening
   a payment popup.

3. Real payment keys and flow [todo]
   Money-critical at the front door. app.js payWithPaystack uses placeholder
   pk_test_xxxx…, and payWithMonnify/payWithTitan are no-op stubs. Wire the
   real SDK keys and move to "submit intent → server verifies via webhook"
   instead of trusting the client.

4. Sign-in / sign-up UI [todo]
   Real accounts: account.html only stores a local name/email and has no
   auth screen, so there is no way to log in, log out, or prove account
   ownership.

5. Chat integration [todo]
   Primary buyer/seller communication: chat.js is entirely browser-storage
   with seeded demo conversations. Point it at /api/v1/conversations +
   messages, sync unread badges, and remove the fake "checkcheck" read ticks.

6. Seller tools on the sell flow [todo]
   The picked picture is dropped when posting online (backend rejects
   non-URL images). Add real image upload plus edit/delete controls for a
   user's own listings (product page has none today).

7. Budget persistence [todo]
   budget.js keeps income and expenses in memory only — data is lost on
   refresh. Persist per user (and ideally server-side), and reuse the shared
   theme helpers instead of duplicating theme code.

8. Rider application flow [todo]
   riders.js just shows a success message. Submit the application to the API
   and surface approval status.

===================================================================
DONE ALREADY (so this doc stays accurate)
===================================================================

- Backend: health endpoint, validated listing CRUD + ownership, cart,
  server-computed order drafts, listing-scoped conversations + messages,
  file-backed dev store, CORS, request-size limits, real authentication
  (register/login/logout/me, scrypt hashing, bearer sessions), api.test.js.
- Frontend: listings load/create wired to the API with localStorage fallback;
  CSS/JS extracted to external files; theme, cart badge, chat badge shell;
  auth methods and bearer-token handling in js/api.js.