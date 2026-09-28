# Duka.cu backend

## Roadmap

### Current baseline

The application is a static student marketplace. Its listings, cart, account,
messages, and theme settings currently live in browser storage. That makes the
demo usable on one device but does not provide accounts, secure checkout,
cross-device data, or administration.

### Delivery plan

1. **Foundation — complete**
   - Create a versioned HTTP API with health checks, JSON request handling,
     safe error responses, and CORS for the existing HTML pages.
   - Use a small file-backed development store so the service works without a
     database installation.
2. **Marketplace — complete**
   - Provide validated listing creation, discovery, filtering, and ownership
     updates/deletion.
   - Provide carts and server-calculated order totals. Client prices are never
     trusted during checkout.
3. **Conversations and fulfilment — complete**
   - Provide listing-scoped conversations and message creation.
   - Delivery/rider assignment remains a production follow-up because the
     existing pages do not define an assignment workflow yet.
   - Real authentication now guards listings, carts, orders, and conversations.
4. **Frontend integration — next**
   - Replace each page's `localStorage` listing/cart/message calls with API
     calls, while retaining a graceful offline fallback during migration.
5. **Production hardening — in progress**
   - Verified student accounts (university email, scrypt password hashing),
     signed sessions, and session-based authorization are implemented.
   - PostgreSQL, object storage for listing images, rate limiting, audit logs,
     moderation, and automated backups remain planned.
6. **Payments and operations — planned**
   - Add a Paystack/Monnify server-side payment verification webhook, inventory
     reservation, rider assignment, notifications, and an admin dashboard.

### Architecture choices

- **Runtime:** Node.js built-in HTTP server. No package installation is needed
  for the first working backend.
- **Storage now:** `backend/data/store.json`, created on first run and excluded
  from Git. It is intentionally a local-development adapter, not production
  storage.
- **API prefix:** `/api/v1` so future revisions can coexist safely.
- **Identity now:** real authentication. Users register with a university email
  domain, passwords are hashed with scrypt, and each login issues a random 256-bit
  session token stored as a SHA-256 digest. Protected routes require
  `Authorization: Bearer <token>`. The former `x-user-id` header is rejected
  unless the server is explicitly started with `ALLOW_DEV_HEADER=true` (strict
  by default, never for production).

### API reference

Run `node backend/server.js`, then visit `GET /api/v1/health`. The default
address is `http://127.0.0.1:3000`; configure it through your shell or
deployment environment. `.env.example` is a configuration template; this
dependency-free server deliberately does not load `.env` files itself.

Register with `POST /api/v1/auth/register` (expects `name`, `email`, `password`;
email must match the allowed domain, default `stu.cu.edu.ng`). Login with
`POST /api/v1/auth/login` to receive a bearer token. Include the token as
`Authorization: Bearer <token>` on all protected endpoints.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Service health |
| POST | `/api/v1/auth/register` | Create a student account |
| POST | `/api/v1/auth/login` | Obtain a session bearer token |
| GET | `/api/v1/auth/me` | Return the authenticated user profile |
| POST | `/api/v1/auth/logout` | Destroy the current session |
| GET, POST | `/api/v1/listings` | Browse/create listings |
| GET, PATCH, DELETE | `/api/v1/listings/:id` | Read/manage a listing |
| GET, POST | `/api/v1/cart` | Read/add cart items |
| DELETE | `/api/v1/cart/:listingId` | Remove a cart item |
| GET, POST | `/api/v1/orders` | Read/create an order draft |
| GET, POST | `/api/v1/conversations` | Read/start conversations |
| POST | `/api/v1/conversations/:id/messages` | Send a message |

Run the no-dependency smoke suite with `node --test backend/tests/*.test.js`.
The test run may create `backend/data/store.json`; it is ignored because it is
local development state.

## Activity log

This section records backend work in plain English. New work will be appended
here as it is completed.

### 2026-09-18

- Inspected the workspace and found eight standalone HTML pages with no server,
  dependency manifest, database schema, or existing API.
- Reviewed the shared frontend state layer. Listings, cart items, account data,
  and chat threads are stored in browser storage, while checkout contains only
  payment-provider placeholders.
- Created this `backend.md` file to record the roadmap, API decisions, and all
  backend work in English.
- Added a standalone Node.js HTTP API with CORS, consistent JSON responses,
  request-size limits, and a health endpoint.
- Added validated listing creation, search/filtering, updates, deletion, and
  seller ownership checks.
- Added cart and order endpoints that calculate totals from server-side listing
  prices instead of trusting prices sent by the browser.
- Added listing-based conversations and protected message creation.
- Added a file-backed local development store, environment example, Git ignore
  rules, package scripts, and API smoke tests.
- Ran the smoke tests, found a persistence race between adding a cart item and
  immediately creating an order, and changed those endpoints to write the
  store before returning their success responses.
- Re-ran the end-to-end smoke suite successfully: two tests passed with no
  failures.
- Integrated listings only after the pages were refactored into shared
  JavaScript files. Added a small API client and connected listing loading and
  listing creation to the backend. Browser storage remains an automatic
  fallback when the listing API is unavailable.
- Deliberately left cart, checkout, chat, authentication, and styling unchanged
  in this integration increment.
- Inspected the existing shared frontend state layer and API routes before
  scoping the work to listings. Confirmed that only listing load and listing
  creation reference `DukaApi` after the change.
- Ran JavaScript syntax checks and the existing backend test suite. Both
  existing tests passed with no failures.
- Added real authentication and authorization. New `/api/v1/auth/*` routes do
  scrypt-hashed registration, login issuing a random 256-bit session token
  (SHA-256 digest stored), logout, and a `/auth/me` profile endpoint. All
  protected routes (`/listings`, `/cart`, `/orders`, `/conversations`, and
  `/messages`) now require a bearer session and enforce seller ownership
  instead of trusting the `x-user-id` header. The header is accepted only when
  `ALLOW_DEV_HEADER=true` is set explicitly.
- Serialized the file store's read/write pipeline with an internal promise
  queue after reproducing a Windows rename (`EPERM`) race and a fresh-store
  seed deadlock during concurrent requests.
- Updated the browser API client (`js/api.js`) to store the session token and
  send `Authorization: Bearer <token>`, and added `register`, `login`, `logout`,
  and `me` methods.
- Rewrote the smoke suite around real sessions: registration, login, `me`,
  logout invalidation, 401s without a session, bad-email/bad-password 400s,
  duplicate-email 409, and a full listing/cart/order flow with a 403 ownership
  check. Debugged a login failure whose root cause was passing the full user
  record instead of its `{ salt, hash }` password object to the verification
  helper. All four tests now pass.
- Updated `.env.example` with `ALLOWED_EMAIL_DOMAIN`, `SESSION_TTL_DAYS` (30),
  and `ALLOW_DEV_HEADER=false`.
