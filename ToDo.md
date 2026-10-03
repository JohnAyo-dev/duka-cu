Duka.cu — What is left to do
done (what is done and what is left is spelled out), [todo] not started, and
[needs you] cannot be finished from inside the code (credentials, accounts,
hosting or a decision).

===================================================================
BACKEND (Ranked in Order of Importance)
===================================================================

--- Priority 1: Critical Functional Fixes & Data Integrity ---

1. Image upload and cross-device storage [todo] [needs you: storage provider or local directory]
   The API currently rejects data URLs in `listingInput` (server.js) and only
   accepts `^https?://`. Consequently, all client photos uploaded on sell.html
   are discarded on save, falling back to a stock Unsplash image. Needs an upload
   endpoint (multipart/form-data or base64) writing to disk or cloud object storage.

2. Inventory reservation while order is pending [todo]
   Orders in `pending_payment` do not reserve stock. Multiple buyers can check
   out the exact same single-stock listing simultaneously and both pay. Needs a
   temporary lock/reservation (e.g. 15-minute hold) that releases on cancellation
   or payment timeout.

3. Payment verification fallback & Monnify webhook [partial]
   Done: POST /api/v1/webhooks/paystack signature verification and status update.
   Left: Monnify webhook implementation (currently selectable in settings but
   has no webhook handler), and a manual status check endpoint (e.g.
   GET /api/v1/orders/:id/verify) to poll the payment provider directly if a
   webhook drops or delays.

--- Priority 2: Core Marketplace Workflows ---

4. Rider fulfillment & delivery order lifecycle [partial]
   Done: POST /riders/applications and admin approval/rejection.
   Left: Endpoints for approved riders to view available deliveries (paid orders
   marked delivery: 'duka'), claim/assign deliveries, and update fulfillment
   status (pending_pickup -> picked_up -> in_transit -> delivered). Orders
   currently stop permanently at status: 'paid'.

5. Admin moderation & seller verification [partial]
   Done: POST /listings/:id/report and audit logging.
   Left: Admin endpoints to view reported listings (GET /api/v1/admin/reports),
   take action (dismiss report, suspend listing, flag seller), and an admin
   endpoint to verify campus sellers (verified is currently hardcoded false).

6. Server-side account deletion endpoint [todo]
   The drawer's Delete Account option only clears local browser storage. The
   backend needs DELETE /api/v1/me to deactivate or purge user account data,
   active sessions, and listings.

--- Priority 3: Database & Reliability Hardening ---

7. Production database migration [todo]
   Migrate from backend/data/store.json to PostgreSQL (or SQLite/Prisma).
   Currently, every read/write reserializes the full JSON file on disk, which
   will choke the Node event loop as data grows, and prevents horizontal
   scaling/clustering across multiple instances.

8. Non-blocking asynchronous static file serving [todo]
   `serveStatic` in server.js uses synchronous `fsSync.readFileSync(file)`.
   Synchronous disk I/O on every HTML/CSS/JS request blocks the Node event loop
   for all concurrent API requests. Needs streaming or async file reads.

9. Store cleanup & memory leak prevention [todo]
   Expired sessions in `data.sessions` are never purged unless a user explicitly
   logs out. Abandoned OAuth states (`data.oauthStates`) and codes
   (`data.oauthCodes`) also linger indefinitely. Needs an automated pruning sweep.

--- Priority 4: Security, Real-Time & Maintainability ---

10. Modular backend refactoring [todo]
    Split monolithic 1000+ line `backend/server.js` into modular routes and
    controllers (`routes/auth.js`, `routes/listings.js`, `routes/orders.js`,
    `routes/riders.js`, `routes/admin.js`).

11. Email ownership verification & password reset [todo]
    Registration only verifies the `@stu.cu.edu.ng` regex domain without
    proving inbox ownership, allowing email squatting. Needs email verification
    tokens/OTPs and a forgotten password reset flow.

12. Production operations & shared rate limiting [partial]
    Done: .env loading, in-memory rate limiting, JSON request logging.
    Left: Redis-backed rate limiting for multi-instance clusters, automated
    backups, monitoring, and HTTPS/hosting setup.

--- Completed Backend Items ---

    Server-computed fees (N500 food, N2500 non-food, N3000 mixed) for Duka delivery.
    GET/PUT /me/preferences and GET/PUT /me/budget per account.
    Unread counts, mark-read, last-message preview, and message list endpoints.

===================================================================
FRONTEND
===================================================================

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

   riders.html submits to the API, is sent through sign-in first if needed, and
   shows the pending / approved / rejected state when you come back.

===================================================================
NEW ITEMS FOUND WHILE DOING THIS
===================================================================

- Listing text was inserted into the page as raw HTML on the marketplace cards,
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



================================================================================================
Other
================================================================================================
   - sell.html redirects non-signed-in visitors to `login.html?next=sell.html`.
   - Headers across the site update "Sell on Duka" to route unauthenticated visitors through sign-in first.
   - login.html displays a contextual prompt ("Sign in to your Duka.cu account to list an item for sale") and defaults role to 'seller' on registration.
   - sell.js pre-fills seller fields from verified student profile, refuses submission without session, and removes unauthenticated local storage listing fallback.