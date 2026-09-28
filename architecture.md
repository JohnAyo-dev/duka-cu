# Duka.cu — Frontend Architecture, Design System & Component Specification

> Status: Implementation-ready spec
> Scope: Full-scale multi-vendor marketplace frontend
> Target stack: React 19 + Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS + Zustand + TanStack Query + Zod
> Migration base: current vanilla HTML/CSS/JS pages (`index`, `product`, `cart`, `sell`, `account`, `chat`, `riders`, `budget`) on the existing Node/Express API.

---

## 0. Guiding Principles

1. **Data is untrusted; UI never assumes completeness.** Every vendor-provided field passes through a normalization layer before render.
2. **URL is the source of truth for discovery.** Search, filters, pagination and document position are always synced to the query string so back/forward/refresh and sharing work.
3. **Client state is derived, cached, and versioned.** Server data is normalized once (TanStack Query -> store), never duplicated.
4. **Buyer and Seller share one visual language.** Identical token system, layout grid, and component inventory — only content density and permission gates differ.
5. **Touch-first, mouse-capable.** Everything is designed mobile-first; desktop is a progressive experience, not a separate app.
6. **Every mutation is optimistic with a rollback path.** Save, follow, message, cart add/remove all update immediately and reconcile on error.

---

## 1. Component Architecture & Directory Structure

### 1.1 Tech Baseline

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router (React 19) | RSC for listing/seller pages, route groups for role portals, `loading.tsx` + `error.tsx` per route |
| Styling | Tailwind CSS v4 + CSS variables (tokens) | Single design-token source; dark mode via `:root`/`.dark` classes |
| Server state | TanStack Query v5 (+ `useMutation`) | Cache, invalidation, optimistic updates, retry/debounce for search |
| Client state | Zustand (vanilla stores, React bindings on top) | Multi-vendor cart, persisted filter session, UI ephemerals; no re-render thrash on lookups |
| Validation | Zod | Normalize + clamp untrusted vendor payloads at the API boundary |
| Fetching | Typed client (`fetch` + Zod) against `/api/v1/*` | Mirrors existing Express API; no codegen dependency |
| Routing | Route groups `/buyer` and `/seller` | Same component library, different layouts/gates |
| Auth | Cookie/HMAC session from existing `/api/v1/auth/*` | Keeps the current token flow; Next middleware gates routes |

### 1.2 Workspace Layout (monorepo-ready)

```text
duka.cu/
|-- app/
|   |-- (marketing)/                 # discovery + trust
|   |   |-- page.tsx                 # home: search hero, feed, recently viewed
|   |   |-- search/page.tsx          # faceted results (server shell + client filters)
|   |   |-- category/[slug]/page.tsx
|   |   |-- item/[id]/page.tsx       # PDP (RSC shell + interaction islands)
|   |   |-- profiles/[handle]/page.tsx   # public buyer/seller profile
|   |-- (buyer)/
|   |   `-- buyer/...                # orders, tracking, wishlist, reviews, pay/address book
|   |-- (seller)/
|   |   `-- seller/...               # catalog, inventory, fulfillment, payouts, analytics, disputes
|   |-- checkout/
|   |   |-- page.tsx                 # multi-vendor split checkout
|   |   `-- confirmation/[orderId]/page.tsx
|   |-- cart/page.tsx
|   |-- chat/                        # in-app messaging (contextual room per listing/order)
|   |-- loading.tsx / error.tsx / not-found.tsx
|   |-- layout.tsx
|   `-- globals.css                  # token layer (see 1.4)
|-- components/
|   |-- ui/                          # design system (see 1.3) — no domain logic
|   |-- discovery/                   # search bar, autocomplete, mega-menu, facets, breadcrumb, results, zero-state
|   |-- listings/                    # listing card, PDP blocks, gallery, reviews, cross-merchandising
|   |-- trust/                       # badges, trust panel, rating bars, dispute disclosure
|   |-- checkout/                    # cart, vendor groups, fee/shipping breakdown, payment, guest
|   |-- dashboards/
|   |   |-- buyer/                   # orders, wishlists, saved addresses, review history
|   |   `-- seller/                  # catalog CRUD, inventory, fulfillment, payouts, disputes
|   |-- messaging/
|   |   |-- InboxList.tsx
|   |   `-- Thread.tsx
|   `-- shared/                      # media (lazy), price, rating, skeleton, empty-state, pagination
|-- lib/
|   |-- api/                         # typed client + Zod schemas (the untrusted-input wall)
|   |-- normalize/                   # vendor -> domain models, safe clamps (see 5.2)
|   |-- search/                      # serialize/deserialize FilterState <-> URLSearchParams
|   |-- pricing/                     # fee engine: subtotals, vendor shipping, platform fees
|   |-- store/                       # zustand stores + persisted slices + hydrators
|   `-- authorization.ts             # role/permission guards shared by middleware + RSC
|-- hooks/                           # useDebouncedSearch, useInfiniteFacets, useOptimisticMutation,
|                                    # usePullToRefresh, useScrollPosition, useFragmentSelector
`-- types/                           # domain models (see section 3)
```

### 1.3 Design System — `components/ui`

Atomic, dependency-free, fully tokenized. No component imports domain models or "talks to" the store.

```text
components/ui/
|-- Button.tsx          # variants: primary/secondary/ghost/danger; sizes sm/md/lg; loading; full-width
|-- IconButton.tsx      # touch target >= 44px
|-- Input.tsx / SearchInput.tsx / Select.tsx / Textarea.tsx
|-- Checkbox.tsx / RadioGroup.tsx / Toggle.tsx / RangeSlider.tsx
|-- Badge.tsx / Pill.tsx / Chip.tsx      # Pill = filter; Chip = tag/attribute; Badge = trust/state
|-- Card.tsx            # base surface + hover/selected/destructive states
|-- Modal.tsx           # a11y dialog, focus trap, scroll lock, top-drawer/slide-up variants
|-- Sheet.tsx           # slide-up bottom sheet for mobile filters / actions
|-- Drawer.tsx          # desktop side panel
|-- Tabs.tsx / Accordion.tsx / Breadcrumb.tsx / Stepper.tsx
|-- Skeleton.tsx / Spinner.tsx
|-- Tooltip.tsx / Popover.tsx
|-- Toast.tsx / Toaster.tsx   # status + undo/retry actions
|-- EmptyState.tsx      # icon, title, body, single CTA (used by zero-results)
|-- Avatar.tsx / RatingStars.tsx / CountBadge.tsx
|-- AspectImage.tsx     # object-fit fallback + blur placeholder + lazy (see 5.2)
|-- Price.tsx           # localized amount, strikethrough original, symbol policy
`-- ErrorBoundary.tsx   # per-island boundary with contextual retry
```

**Design system rules**

- Every component exposes `className` passthrough + named semantic props; no hardcoded hex inside components.
- Colors/spacing/type/radius/motion come **only** from tokens (`bg-surface`, `text-ink`, `shadow-card`, `rounded-2xl`, `animate-slide-up`, `duration-200`).
- Loading is first-class: skeletons are per-card size variants, not a global spinner.
- Touch targets: interactive elements >= 44x44 px; `focus-visible` ring always present; reduced-motion respected via `motion-safe:` / `motion-reduce:`.

### 1.4 Shared tokens & theme (design system spec)

```css
/* globals.css — token layer */
:root {
  --color-bg: #f7f7f5;            /* page canvas */
  --color-surface: #ffffff;       /* cards, sheets */
  --color-surface-2: #f1f1ee;     /* wells, grouped rows */
  --color-overlay: rgba(15,17,14,0.55);
  --color-ink: #171714;           /* primary text */
  --color-ink-muted: #5b5b55;
  --color-ink-faint: #8a8a82;
  --color-brand: #2f6f4f;         /* duka green — CTAs */
  --color-brand-strong: #24573e;
  --color-accent: #d97706;        /* price highlights, notifications */
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger: #dc2626;
  --color-info: #2563eb;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
  --radius-xl: 24px; --radius-full: 999px;
  --space-1: 4px; /* ... */ --space-12: 48px;
  --font-sans: "Inter", system-ui, sans-serif;
  --type-display: clamp(1.75rem, 4vw, 2.5rem); /* scale: display/title/heading/body/small/caption */
  --shadow-1: 0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.10);
  --shadow-2: 0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04);
  --shadow-3: 0 12px 32px rgba(0,0,0,.14);
  --ease-out: cubic-bezier(.22,1,.36,1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
  --maxw-page: 1280px;
}
.dark { /* mapped semantic overrides only; component code untouched */ }
```

---

## 2. Core State Management & Data Flow Matrix

### 2.1 Strategy summary

| Domain | Server/URL truth | Client cache | Client store | Persisted (localStorage) |
|---|---|---|---|---|
| Search & facets | URL query params | TanStack Query result-set cache | `searchStore` (serialized `FilterState`, cursor/scroll pos) | Facet session overrides, last-query draft |
| Multi-vendor cart | Server cart API (anonymous = guest token) | Cart snapshot via query | `cartStore` (normalized lines, derived groups) | Guest cart (encrypted-safe), grouping memo |
| Dashboards & role | Route group + server session | Portal queries | `sessionStore` (user, roles, active portal) | Auth token (existing), portal last-view |
| Messaging | Room API | Thread cache | `messagingStore` (drafts, typing) | none |
| Personalization | Recently-viewed local; similar-items server | Query cache | `recentsStore` | Recently viewed (TTL'd) |

**Rules**

- **URL-first discovery:** `FilterState` <-> `URLSearchParams` is a bijective serializer (see `lib/search/serialize.ts`). Back/forward restores full state; `popstate` rehydrates `searchStore`, then TanStack Query refetches the same cache key (instant).
- **Derived, not duplicated:** cart groups, subtotals, shipping pools and fee rows are pure functions over the normalized cart (`computeCartDerivations(cart, shippingQuotes)`).
- **Normalize at the edge:** API responses pass Zod -> normalized domain model before entering cache or store.
- **Optimistic everywhere:** every `useMutation` ships `onMutate` (snapshot + patch) and `onError` (rollback + toast with "Retry").

### 2.2 Data flow matrix

| # | Flow | Publish | Consume | Mutate | Sync channel | Edge cases |
|---|---|---|---|---|---|---|
| 1 | Autocomplete query | `SearchInput` 300 ms debounce | `useQuery(['ac', q])`, cancel-on-type | — | Race-safe via `AbortController` + query key | Stale result must never clobber newer key |
| 2 | Facet toggle | `FacetList` -> `searchStore.apply(facet)` | URL replace, results query | `router.replace` (push only on new semantic query) | Facet preserves scroll position | Mobile sheet must not re-push full history |
| 3 | Cart add item | `AddToCart` | `cartStore.add` -> server mutation | Optimistic + rollback | Touch/click, idempotent key | Duplicate line merges qty; out-of-stock rolls back with toast |
| 4 | Shipping quotes on cart change | `cartStore` subscribe | `useQuery(['shipping', cartVersion])` recalcs per vendor pool | none | Debounced 600 ms | Partial/empty address -> per-vendor "quote needed" |
| 5 | Checkout submit | `CheckoutSummary` | `createCheckoutSession` mutation | Optimistic "processing"; final order id | Server authoritative | Multi-vendor split: partial failure -> per-vendor rollback plan |
| 6 | Save item / follow seller | Row action | `recentsStore` / `followingStore` | Optimistic heart/follow + toast "Saved — get price alerts" | — | Duplicate toggle race: reconcile from server response |
| 7 | Dashboard role switch | Navigation | `sessionStore.activePortal` | Route group change | URL (`/buyer`, `/seller`) | Gate via `authorization.ts`; redirect to `/auth` if unauthorized |
| 8 | Pull-to-refresh | `usePullToRefresh` | Invalidate visible queries | — | Refresh indicator only | Only on data-list routes; never PDP/checkout |

### 2.3 Cart store shape (multi-vendor)

```ts
type CartStore = {
  lines: Record<string, CartLineNode>;   // key: `${vendorId}:${listingId}:${attrsKey}`
  sources: Record<string, ServerState>;  // guest vs authed; version for staleness
  add, remove, setQty(items, opts): void; // optimistic, returns rollback fn
  hydrate(snapshot: CartDto | null): void;
}
```

Vendor grouping is **derived** in `lib/pricing` — stored data only ever holds flat, normalized lines.

---

## 3. Key UI Component Interfaces (TypeScript Definitions)

> All domain types are the *normalized* output of `lib/normalize` (`N*`). The store/API may return raw vendor shapes at the boundary; only `N*` reaches components, guaranteeing safe rendering (see 5.2).

### 3.1 Listings & Vendors

```ts
export interface Price {
  amountMinor: number;            // integer minor units (cents / shillings), avoids float drift
  currency: "KES";
  originalAmountMinor?: number;   // for strikethrough/discount
  symbol: "KSh";
}

export type ListingCondition = "new" | "like-new" | "used-good" | "used-fair" | "refurbished";

export interface ListingImage {
  src: string;                    // CDN URL
  alt: string;                    // required; falls back to listing title
  aspect: "1:1" | "4:3" | "16:9";
  blurDataUrl: string;            // inline 8x8 placeholder
}

/** Normalized listing — render-safe, all fields clamped/defaulted. */
export interface ListingItem {
  id: string;                     // `${vendorId}:${sku}` — globally unique
  vendorId: string;
  slug: string;
  title: string;                  // clamped 8–120 chars
  description: string;            // clamped; may be "" -> sections omitted, never blank cards
  categoryPath: string[];         // ["Electronics", "Audio", "Speakers"]
  price: Price;
  quantityAvailable: number;      // floored at 0
  images: ListingImage[];         // may be [] -> AspectImage shows fallback (5.2)
  condition: ListingCondition;
  attributes: Record<string, string>;   // free-form vendor attrs (safe keys/values, allowlisted render)
  ratings:
    | { count: 0; average: null }        // explicit unrated state
    | { count: number; average: number }; // average clamped 0–5, 1 decimal
  badges: ListingBadge[];
  createdAt: string;
  related?: { similar: ListingSummary[]; sameVendor: ListingSummary[] }; // cross-merchandising
}

export type ListingSummary = Pick<
  ListingItem, "id" | "slug" | "title" | "price" | "images" | "ratings" | "badges"
>;

export type ListingBadge =
  | { kind: "verified-vendor" }
  | { kind: "discount"; pct: number }          // computed, not vendor-supplied
  | { kind: "fast-ship"; etaDays: number }
  | { kind: "deal"; endsAt: string };

export interface PayoutSummary {
  balanceMinor: number;
  pendingMinor: number;
  nextPayoutAt: string | null;
  lifetimeEarnedMinor: number;
}

/** Normalized public seller profile used across trust surfaces and PDPs. */
export interface VendorProfile {
  id: string;
  handle: string;                 // username for /profiles/[handle]
  displayName: string;
  avatar?: { src: string; alt: string };
  bio: string;                    // clamped; empty -> omitted sections
  joinedAt: string;
  location: { region: string; city?: string };
  trust: {                        // each optional piece renders its own surface; none blocks the page
    idVerified: boolean;
    idVerifiedSince?: string;
    rating: { count: number; average: number | null };   // aggregate rating score
    totalSales: number;
    responseRatePct: number | null;
    responseTimeMinutes: number | null;
    policies: {
      returns: "none" | "7-day" | "14-day" | "30-day" | "custom";
      warranty?: string;
      disputeResolution: "marketplace-mediation" | "vendor-direct";
    };
  };
  statsForSelling: PayoutSummary;
  badges: Array<"id-verified" | "pro-seller" | "top-rated">;
  following: { isFollowing: boolean; followerCount: number };
}

### 3.2 Search & Faceting

```ts
/** A single selectable facet: `kind` drives the widget and the serializer. */
export type SearchFacet =
  | { kind: "category"; id: string; label: string; parentId?: string; count: number }
  | { kind: "price"; min: number; max: number; step: number; count: number }
  | { kind: "attribute"; key: string; label: string; value: string; count: number }
  | { kind: "condition"; value: ListingCondition; count: number }
  | { kind: "vendor-badge"; value: ListingBadge["kind"]; count: number }
  | { kind: "seller"; id: string; label: string; avatar?: string; count: number }
  | { kind: "rating"; min: 1 | 2 | 3 | 4; count: number };

export interface FilterState {
  q: string;                          // raw prose query, trimmed
  categoryPath: string[];             // multi-level (top -> secondary)
  facets: Record<string, string[]>;   // key = facet id / `${kind}:${key}`, value = selected ids/values
  price?: { min?: number; max?: number };
  condition: ListingCondition[];
  vendorIds: string[];
  ratingMin?: 1 | 2 | 3 | 4;
  inStockOnly: boolean;
  sort:
    | { by: "relevance" }             // server-ranked
    | { by: "price"; dir: "asc" | "desc" }
    | { by: "rating"; dir: "desc" }
    | { by: "newest"; dir: "desc" };
  page: number;
  perPage: 24;
}

/** Server->client facet result. Counts power the "real-time" updates. */
export interface FacetResult {
  facets: SearchFacet[];
  totals: { count: number; filtersMatched: number; facetsWithMatches: number };
  relaxedBy: Array<{ type: "category" | "price" | "condition" | "spelling"; removed: string }>;
}

export interface SearchResultsPage {
  items: ListingSummary[];
  facetResult: FacetResult;
  cursor?: string;                    // infinite scroll cursor
  spellCorrection?: { original: string; corrected: string };
  queryClassifier?: { intent: "product" | "category" | "vendor" | "navigational" };
  relatedSearches: string[];
}

### 3.3 Multi-Vendor Cart & Checkout

```ts
export interface CartLineItem {
  key: string;                        // `${vendorId}:${listingId}:${attrsKey}`
  listingId: string;
  vendorId: string;
  listing: ListingSummary;            // snapshot for instant render
  quantity: number;
  selected: boolean;                  // per-line checkbox (partial checkout)
  addedAt: string;
  maxPerOrder: number;                // clamp quantity
  unitPrice: Price;                   // may carry negotiated/sale price
}

/** Normalized cart: flat lines only; groups/pricing are derived (2.3). */
export interface MultiVendorCart {
  version: number;                    // bump on every mutation; keys shipping/pricing queries
  lines: CartLineItem[];
  sources: { id: string; mode: "guest" | "authed"; guestToken?: string; updatedAt: string };
}

export interface VendorShipmentQuote {
  vendorId: string;
  method: "standard" | "express" | "contact-seller";
  estimatedDays: { min: number; max: number };
  shippingMinor: number | null;       // null = manual quote (contact-seller)
  freeShippingThresholdMinor?: number;
  handlingNote?: string;
}

/** Derived per-vendor + platform totals (pure function output). */
export interface PriceBreakdown {
  perVendor: Array<{
    vendorId: string;
    vendor: VendorProfile;
    itemsMinor: number;
    shippingMinor: number | null;
    platformFeeMinor: number;
    taxMinor: number;
    subtotalMinor: number;
    lineByLine: Array<{ label: string; amountMinor: number; isFee: boolean }>;
  }>;
  totals: {
    itemsMinor: number;
    shippingMinor: number;
    platformFeeMinor: number;
    taxMinor: number;
    grandTotalMinor: number;
    status: "collecting-quotes" | "ready";  // "ready" only when every quote resolves
  };
}

export interface CheckoutSession {
  id: string;
  status: "building" | "processing" | "awaiting_payment" | "confirmed";
  mode: "guest" | "authed";
  contact: { email: string; phone?: string };
  addresses: { shipTo: AddressSummary; billTo: AddressSummary };
  payments: PaymentIntent[];          // one per vendor group (split capture)
  breakdown: PriceBreakdown;
  orders: OrderPreview[] | null;      // resolved after each payment intent
  timestamps: { created: string; expiresAt: string };
}

export interface PaymentIntent {
  id: string;
  vendorGroupId: string;
  provider: "mpesa" | "card" | "paypal" | "bank";
  amountMinor: number;
  status: "pending" | "authorized" | "captured" | "failed" | "refunded";
}

export interface AddressSummary {
  id: string; label: string;          // "Home", "Campus"
  name: string; line1: string; line2?: string;
  city: string; region: string; postalCode?: string;
}

export interface OrderPreview {
  orderId: string;
  vendorId: string;
  items: CartLineItem[];
  shipment: VendorShipmentQuote;
  payment: PaymentIntent["id"];
  tracking?: { carrier: string; trackingNo: string; statusUrl?: string };
}
```

### 3.4 Key component prop contracts

```ts
// Discovery
interface SearchResultsControllerProps {
  initial: FilterState;               // hydrated from RSC for first paint
  serverPage: SearchResultsPage;      // SSR first page, then client-driven
}
interface FacetListProps {
  facets: SearchFacet[];              // server-provided counts
  state: FilterState;
  onCommit(facet: SearchFacet, value: string | number | boolean): void;
  onClear(kind?: SearchFacet["kind"]): void;
}

// Listings
interface ListingCardProps {
  listing: ListingSummary;
  layout: "grid" | "list" | "compact";
  actions?: { save: boolean; message: boolean; addToCart: boolean };
  onSave?(l: ListingSummary): void;   // optimistic heart
}
interface AddToCartProps {
  listing: ListingItem;
  variantKey?: string;
  quantity: number;
  disabledReason?: "out-of-stock" | "max-limited";
}

// Trust
interface SellerTrustPanelProps {
  vendor: VendorProfile;
  orderContext?: { listingId?: string; orderId?: string };
  openDispute(): void;                // pre-seeded with vendor + order
}

// Checkout
interface VendorGroupCardProps {
  group: PriceBreakdown["perVendor"][number];
  onSelectShipment(vendorId: string, method: VendorShipmentQuote["method"]): void;
}
interface CheckoutSummaryProps {
  session: CheckoutSession;
  onPay(intent: PaymentIntent): void; // multi-tap per vendor, then one confirm
}
```

---

## 4. Critical UI/UX Component Blueprint

### 4.1 Faceted Search & Filter Panel

**Behavior contract**

| State | Desktop (>= lg) | Mobile (< lg) |
|---|---|---|
| Placement | Sticky left rail, `w-72`, scrollable, sticky below header | Hidden; opens as slide-up `Sheet` (max-h 85vh) |
| Apply semantics | Live — every toggle commits immediately to URL | Two-step: changes staged; "Show N results" applies the draft |
| Result counts | Inline per facet option, updated on every commit | Inline, updated live *while staging* |
| Active filters | Persistent pills row above results | Pills row + summary chip on trigger ("Filters . 3") |
| Clear | Per-facet "x" + single "Clear all" | Same + swipe-down-to-close gesture |
| History | URL drives it; back/forward restores scroll | Same (URL is the single source of truth) |

**Structure (unified primitives, two surfaces):**

```tsx
// Desktop rail + mobile sheet share the same FacetList; only the shell differs.
// Mobile: <Sheet open={filtersOpen} onDismiss={stageAndClose}>
//   <FacetList state={draftState} onCommit={stage} ... />
//   <StickyApplyBar count={resultCount} onApply={applyAll} />
// </Sheet>
// Desktop: <aside className="sticky top-16 hidden max-h-[calc(100vh-7rem)] w-72 shrink-0 overflow-y-auto lg:block">
//   <FacetList state={state} onCommit={commitLive} ... />
// </aside>
```

**FacetList visual/interaction spec**

- Groups as `Accordion`, collapsed by default except `Category` and `Price`.
- `Category`: two-level tree with indented children; a selected child highlights its parent chain.
- `Price`: dual `RangeSlider` with live min/max labels, formatted `KSh 1,500`.
- `Condition` / `Rating`: checkbox rows with `count` right-aligned; Rating shows `RatingStars`.
- `Seller`: avatar + name + toggle (used on "filter this feed").
- Row affordances: tapping anywhere selects the row (not just the box); row hover `bg-surface-2`; focus-visible ring.
- Count of `0` renders the row muted (`opacity-50`, not disabled) — users see it exists but has no matches under current filters.
- Active pills: `<div className="flex flex-wrap gap-2">` of `Pill role="button"` with label + `x`; "Clear all" ghost link when > 1 active.

**Commits -> URL (one serialized object, no query bloat):**

```ts
// URL shape: /search?q=couch&f=price:0-8000|cond:used-good|cat:living|rating:4&sort=price:asc&p=2
// lib/search/serialize.ts
export function serializeFilter(f: FilterState): string;   // stable ordering => stable cache keys
export function parseFilter(encoded: string | null): FilterState; // Zod-validated, clamped [min,max],[0,5]
```

**Loading & zero-snapshot:** while `isFetching`, each facet group collapses to 4 `Skeleton` rows (`aria-busy`); results grid shows 8 card skeletons matching card aspect ratio.

---

### 4.2 Multi-Vendor Cart & Checkout Summary

**Blueprint — two stage surfaces on one page:**

```text
+-------------------------------------------------------+
| Header: "Cart (7 items) . 3 sellers"                  |
+------------------------------+------------------------+
| STAGE A - Vendor groups      | STAGE B - Order summary|
| 1. Kwanza Electronics        | sticky right rail      |
|    [img] Blender x2  ....    |  Items ......... 5,400 |
|    [img] Kettle x1   ....    |  Shipping (3 sellers)  |
|    Shipping: [Standard 4-6d  |    Standard .... +450  |
|              KSh 450 v]      |    Contact se.. +0    |
|    [See fee breakdown >]     |  Platform fee ... -120 |
|    Group subtotal KSh 8,200  |  Total    KSh 6,....  |
| 2. Juja Books                |  [Checkout ->]         |
|    [img] Novel x1 ....       |  [Continue shopping]   |
| 3. Campus Fashion (contact   |                        |
|    seller for shipping)      |                        |
+------------------------------+------------------------+
```

**Stage A — `VendorGroupCard.tsx`**

- Each vendor = a `Card` with header `Avatar + displayName + Badge(id-verified | rating)` and right-aligned group subtotal.
- Item rows: `AspectImage` 80x80, title (2-line clamp), attributes line, qty `Stepper` (`min=1 max=maxPerOrder`), line price, remove `IconButton`.
- Shipping sub-card (`Dropdown` of quotes). A `null` quote renders the muted note "Shipping set by seller — we'll confirm via chat" — it does **not** block checkout; the whole group just shows status "awaiting quote".
- "See fee breakdown >" expands an inline disclosure: `platformFee`, `tax`, and *"Duka.cu keeps X% — the rest goes to this seller."* Required for trust.
- Group footer: per-vendor subtotal + "Message this seller" link (opens pre-seeded messaging room).

**Stage B — `CheckoutSummary.tsx` (sticky right rail)**

- Derives `PriceBreakdown` from `cartStore` on every line/qty/shipment change (memoized; `Skeleton` while `status === "collecting-quotes"`).
- Lines: **Items**, **Shipping** (one per vendor method, labeled, e.g. `Standard · Kwanza + KSh 450`), **Platform fee** (`-` styled, tooltip "covers buyer protection"), **Total** emphasis.
- CTA `Button` full-width; disabled + "Waiting on shipping quotes…" when `status !== "ready"`.
- Guest: `Pill` "Checkout as guest" below a divider; sets `CheckoutSession.mode = "guest"`.

**Responsive**

- `lg+`: two-column `grid-cols-[1fr_340px]`; summary `sticky top-16 self-start max-h-[calc(100vh-5rem)] overflow-y-auto`.
- `< lg`: summary becomes a fixed bottom `Sheet`/`StickyBar` ("Total KSh .. · Checkout") that expands to the full breakdown; vendor groups stack full-width.
- Per-line checkboxes: deselecting a subset re-derives totals + shipping immediately; deselected vendor groups drop out of the breakdown.

---

## 5. Mobile-First & Edge-Case Handling Strategies

### 5.1 Zero-Results UX

1. **Detect cause, don't just say "no results."** Server returns `queryClassifier` + `spellCorrection` + `relaxedBy`. Client maps to priority actions:
   - *Spelling* -> "Did you mean **couch**?" with a one-tap corrected-search pill.
   - *Category/price/condition over-constraint* -> `FacetResult.relaxedBy` drives "We relaxed **price** to show 12 similar items" + an undo pill that restores the removed facet.
   - *Genuinely empty* -> premium `EmptyState`: friendly header, "Browse these instead", "Talk to a human" (chat), "Start selling this item" (converts failed search into seller intent).
2. **Auto-relax ladder (server-driven, client-illustrated):** spelling -> drop one category level -> widen price -> drop condition -> show cross-category "popular right now" feed. Always present the original query as a caption with "Reset filters".
3. **Never render a bare grid.** Empty search always renders a curated component: related-searches chips, top-category tiles, seller-feed teaser.
4. **Facet panic button:** sticky "Clear all" stays in viewport whenever `filtersMatched === 0`.

### 5.2 Inconsistent Vendor Data (safe rendering)

- **Normalization wall (`lib/normalize`):** every vendor field passes Zod. Failures are *not* thrown — they are swapped for typed fallbacks and logged (`MissingImage`, `BadPrice`). The UI only ever sees `N*` shapes that are deterministically render-safe.
- **Missing photos:** `ListingImage[]` may be empty. `AspectImage` renders a branded placeholder (duka logo tile + title initial), never a broken-image icon, and reserves aspect to prevent layout shift (`aspect-[1/1]`).
- **Blurry images:** `blurDataUrl` placeholder until `onLoad`; `loading="lazy"` below the fold; `fetchPriority` only on above-fold hero images.
- **Description variance:** two-line clamp on cards with `title=` tooltip; PDP uses no clamp with "Read more" expand only past 600 chars.
- **Unstandardized `attributes`:** known keys (`brand`, `model`, `size`, `year`) render inline; unknown keys collapse into a "More specs" accordion only when count >= 3, otherwise behind "Details". They must never blow up card height.
- **Price/quantity clamps:** `amountMinor >= 0`, `quantityAvailable` floored at 0; negative/NaN values clamp, never surface as `-KSh`.
- **Rationalized ratings:** omit stars on cards with `ratings.count === 0`; render nothing rather than "0.0 (0)".
- **Renders degrade by removal, not by dump:** a cart line whose listing was deleted renders as a disabled, clearly labeled "No longer available" row with a Remove button — never a 404 crash or blank tile.

### 5.3 Micro-interactions & Touch

| Pattern | Implementation |
|---|---|
| Touch targets & feedback | All interactive >= 44x44 px; `active:scale(0.98)` on cards/buttons; safe-area insets (`env(safe-area-inset-bottom)`) on bottom nav/sheets |
| **Haptics** | `navigator.vibrate?.(10)` on add-to-cart, save-item, pay success, pull-to-refresh completion; gated to touch devices + `prefers-reduced-motion` off; via `lib/haptics` util with silent no-op fallback |
| **Pull-to-refresh** | Custom `usePullToRefresh` (pointer events, not overscroll) on orders/feed/search routes; animated spinner under header; cancels if < 72px; triggers `invalidateQueries(visible)` |
| Loading skeletons | Per-shape skeletons (card/image/line/accordion), shimmer (`animate-pulse` + gradient), `aria-busy` |
| **Optimistic updates** | `Save Item` (heart fills instantly, toast "Saved — we'll alert you on price drops" + Undo), `Follow Seller`, `Message Seller` (thread opens with optimistic placeholder bubble), `Add to Cart` (badge increments, sheet preview), `Qty change` (price recalculates locally; server reconcile on response) — every one has rollback + retry on error |
| Bottom navigation | 5 slots (Home, Search, Cart w/ count badge, Chats w/ unread badge, Account); cart badge animates on add; within thumb reach |
| Slide-up panels | `Sheet` uses `transform` + `--dur-slow` custom bezier; backdrop blurs 1–4px; body scroll locked; drag-handle affordance; safe-bottom padding |
| Success states | Checkout button -> loading spinner -> full-screen animated confirmation (check) -> links to tracking |
| Reduced motion | `motion-reduce:` collapses springs to 0ms; haptics disabled; skeleton shimmer static |

### 5.4 Performance guardrails

- Route-level hints: RSC secondary pages for listings/search; `loading.tsx` per domain; `useTransition` around filter commits.
- Memoization tiers: listing cards `memo`-ized by `listing.id`; facets rerender only on count change; cart lines rerender only when their own `version` changes.
- Media: CDN `?w=`/`?dpr=` resizing, `sizes` attributes, `IntersectionObserver` lazy-load — no eager full-res images except the PDP hero.
- Store subscriptions use slice selectors; serializer memoized against `FilterState` identity to avoid re-render storms.
- Caching: `staleTime` 60s listings, 15s facet counts, 5min vendor trust panels.

---

## 6. Implementation Roadmap (vanilla -> React migration)

1. **Phase 0 — Tokens & design system:** port `css/base.css` -> `globals.css` tokens; build `components/ui` primitives; parity-check against current pages.
2. **Phase 1 — Discovery:** migrate `index.html` + search; deliver search hero, autocomplete, mega-menu, faceted results, zero-state. URL sync lands here.
3. **Phase 2 — Listings & trust:** PDP + listing cards + seller profile + rating/review components; normalization wall in `lib/normalize`.
4. **Phase 3 — Cart & checkout:** `cartStore`, pricing engine, vendor-grouped cart, split checkout, guest mode.
5. **Phase 4 — Dashboards:** route groups `/buyer`, `/seller`; RBAC via `authorization.ts`; catalog CRUD + fulfillment + payouts for sellers.
6. **Phase 5 — Personalization & messaging:** recently viewed, price-drop alerts, follow feeds, in-app chat with audit-log view.
7. **Cross-cutting:** `ErrorBoundary` per island, Playwright smoke for the 7 core domains, Lighthouse budget (LCP < 2.5s on 4G).

---

## 7. Open Decisions (resolve before Phase 1)

- **Fee display policy:** absolute minor units vs percentage at checkout. Recommend absolute units + a "how fees work" tooltip for campus-user trust expectations.
- **Shipping "contact-seller" groups:** block checkout vs split-intent payments per vendor. Recommend split-intent (per-vendor `PaymentIntent`) so one slow seller never blocks the rest — this is why `CheckoutSession.payments` is an array.
- **Guest checkout data retention:** how long guest carts + sessions persist (recommend 30 days, then silent expiry with a warning toast on access).
- **Currency/locale breadth:** start KES-only; make `Price` a single source so adding currencies is a tokens change, not a component change.