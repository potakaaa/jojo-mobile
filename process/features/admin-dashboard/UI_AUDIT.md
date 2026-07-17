# UI Audit: Admin Dashboard (`apps/admin`)

**Revision 2 — 17-07-26.** Full-product audit of the Jojo Potato admin dashboard against the
**Tactile Comic Brutalism** design direction (2px ink borders, hard offset shadows, jyellow
active states, Fredoka display, cream ground, tactile press states) and eight quality
dimensions: the original five (A11y, Performance, Responsive, Theming, Anti-Patterns) plus
three added for this pass — **Consistency across screens**, **UX flows & states**, and
**Information density/hierarchy** for an ops dashboard.

Scope: every built surface (login, dashboard shell, branches, categories, products +
detail, deals list/detail/create-wizard/availability editor, promotions, offers +
detail/generate-coupons/coupon list, `/components` showcase, all shared composites and ui/
primitives, `entity-status.ts`, `nav-config.ts`, `globals.css`) **plus** the planned surface
(phase-05 rewards, phase-06 orders, phase-07 analytics, adm-008 free-mechanics P3). Findings
against plan files are marked _(planned surface — plan may still be in flux)_.

Methodology: `impeccable` audit protocol (5-dimension scoring, P0–P3 severity, anti-pattern
match-and-refuse list) + `ui-ux-pro-max` heuristics (touch targets, cursor affordance,
contrast tables, no-emoji-icons, loading-state rules). Static code reading only — no browser
run.

## Audit Health Score

Scored 0–4 per dimension, now across 8 dimensions (max 32). Bands: 29–32 Excellent, 23–28
Good, 16–22 Acceptable, 10–15 Poor, 0–9 Critical.

| #         | Dimension              | Score     | Key Finding                                                                                                                                                                                                            |
| --------- | ---------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Accessibility          | 2         | `text-primary` (jyellow) page titles on cream ≈ 1.35:1 contrast — every CRUD screen title is near-invisible.                                                                                                           |
| 2         | Performance            | 3         | Lean React/query usage; render-blocking Google Fonts `@import`; `beforeLoad` auth fetch on every navigation.                                                                                                           |
| 3         | Responsive Design      | 3         | Tables scroll, mobile sheet exists; dialogs go full-bleed at <28rem, wizard remove button is a bare text glyph.                                                                                                        |
| 4         | Theming                | 2         | Two-layer token mapping is solid, but `--sidebar-*` slots are stock shadcn grays and brutalist styling still lives on consumers (18 hand-applied `shadow-offset` sites across 12 files).                               |
| 5         | Anti-Patterns          | 3         | No AI-slop tells; committed brand. Residue: `⚠`/`✓` text glyphs as icons, raw enum strings (`super_admin`, `available`) in UI.                                                                                         |
| 6         | Consistency            | 2         | Three generations of list implementation, two dialog implementations, three `<select>` stylings, two status-display conventions coexist.                                                                               |
| 7         | UX Flows & States      | 2         | Loading = plain text (Skeleton primitive unused); zero success feedback (copy, mutations); offer deactivation is one-click while every other deactivate is confirm-gated; targeted coupons require pasting a raw UUID. |
| 8         | Info Density/Hierarchy | 2         | Dashboard home is an empty welcome card; lists have no search/counts/sort; duplicate `<h1>`s per detail page; `max-w-4xl` wastes ops screen width.                                                                     |
| **Total** |                        | **19/32** | **Acceptable — real design-system core exists, but discipline, feedback loops, and one contrast bug need work before P5–P7 triple the screen count.**                                                                  |

## Anti-Patterns Verdict

**Pass, with residue.** The interface would not read as AI-generated: the brand is committed
(drenched jyellow actives, hard 4px offset shadows, Fredoka/Plus Jakarta pairing on a warm
cream ground), there is no glassmorphism, no gradient text, no ghost-card border+blur-shadow
pairing, no hero-metric template, no decorative grids. The cream body is a deliberate ported
brand token from `packages/ui/src/theme.ts`, not a default.

Residue to clean: (a) text glyphs used as icons — `⚠` in the deal savings warning
(`deal-create-wizard.tsx:345`, `deals.$dealId.tsx:159`), `✓` prefix in the wizard branch
toggle (`deal-create-wizard.tsx:392`), `×` as the remove control (`deal-create-wizard.tsx:306`)
— lucide is already a dependency; (b) raw enum strings leaking into chrome (`super_admin`
role badge in `nav-user.tsx`, lowercase coupon `status` strings in `coupon-list.tsx`); (c) the
systemic issue from revision 1 **still holds in weakened form**: brutalist identity (offset
shadows, tactile press states) is applied by consumers, not guaranteed by primitives — see
P1-2.

## Executive Summary

- **Audit Health Score:** 19/32 (Acceptable)
- **Total issues:** 24 (1 P0, 7 P1, 11 P2, 5 P3)
- **Top critical issues:**
  1. **[P0]** `text-primary` used as _text color_ on cream backgrounds — every page title
     (`page-header.tsx` + 4 inline `<h1>`s), the coupon-issue success message, and the
     "Available" availability label render jyellow-on-cream at ≈1.35:1 contrast.
  2. **[P1]** Offer Activate/Deactivate is a one-click destructive-variant toggle with no
     confirmation, while branches/categories/products/deals all confirm-gate deactivation —
     the safety convention is inconsistent exactly where a live discount goes dark.
  3. **[P1]** The `--sidebar-*` semantic slots in `globals.css` are still stock shadcn grays;
     the mobile sheet sidebar and all built-in menu hover/active states render off-brand.
  4. **[P1]** No success-feedback channel exists anywhere: coupon "Copy" gives no
     confirmation, mutations close dialogs silently, and the one success message that exists
     is invisible (P0 color).
  5. **[P1]** Targeted coupon issuance requires pasting a raw user UUID
     (`generate-coupons-panel.tsx`) — an ops workflow with no user lookup.
- **Recommended next steps:** fix the P0 color misuse in one pass (it is one class swap in
  ~7 sites), bake the brutalist recipe into `Button`/`Card` variants, map the sidebar
  tokens, then standardize the four divergent component generations **before** phases 5–7
  add rewards, orders, and analytics screens on top of them.

## Detailed Findings by Severity

### P0 — Blocking

#### [P0-1] jyellow (`text-primary`) used as text color on cream — ≈1.35:1 contrast

- **Location:**
  - `apps/admin/src/components/page-header.tsx:29` (`<h1 className="… text-primary">` — used by categories, products list+detail, deals list+detail, offers list+detail, promotions)
  - `apps/admin/src/routes/(dashboard)/branches.tsx:87`, `products.$productId.tsx:75`, `deals.$dealId.tsx:102`, `offers.$offerId.tsx:73` (inline `<h1>` duplicates of the same pattern)
  - `apps/admin/src/features/offers/components/generate-coupons-panel.tsx:121` (`text-sm text-primary` success message — 14px non-bold, needs 4.5:1)
  - `apps/admin/src/features/deals/components/deal-availability-editor.tsx:57` (`text-primary` "· Available" inline label)
- **Category:** Accessibility / Theming
- **Impact:** `--primary` is `#FFD21E` on `#FFF6E6` ground — computed contrast ≈ **1.35:1**.
  Large display text needs 3:1 (WCAG AA), 14px body text needs 4.5:1. Page titles — the
  single strongest hierarchy anchor on every CRUD screen — and the only success message in
  the app are close to invisible. `admin-home.tsx:16` shows the intended trick
  (`text-primary` + `[text-shadow:var(--shadow-offset-sm)]` ink shadow), but every other
  site dropped the shadow, and even with it, a 4px offset shadow is not a contrast substitute.
- **WCAG/Standard:** WCAG 2.1 SC 1.4.3 (AA)
- **Recommendation:** In `page-header.tsx` and the 4 inline `<h1>`s: `text-foreground`
  (matching the Overview page's `text-display … text-foreground` heading), reserving jyellow
  for **surfaces** (active nav item, primary button, success chip) as the sidebar and
  StatusBadge already correctly do. Success message → `text-foreground` on a `bg-primary`
  chip, or the green token (`--color-green-dark` on cream = compliant). Availability label →
  `font-semibold text-foreground` vs `text-muted-foreground`.
- **Suggested command:** `$impeccable polish apps/admin/src/components/page-header.tsx`

### P1 — Major

#### [P1-1] Offer deactivation has no confirmation gate (safety convention broken)

- **Location:** `apps/admin/src/routes/(dashboard)/offers.$offerId.tsx:84-92`; contrast with
  `deals.index.tsx:135-151`, `categories.tsx:127-143`, `products.index.tsx:144-160`,
  `features/branches/components/deactivate-branch-dialog.tsx`
- **Category:** UX Flows & States / Consistency
- **Impact:** Deactivating a live customer-facing offer (and killing its issued coupons'
  redeemability window) is a single click on a red button. Every other entity's deactivate
  is gated behind `ConfirmDialog` per the program's stated Safety requirement ("must never
  be a one-click action"). The same red `destructive` variant also serves as a **state
  toggle** here and in `deal-availability-editor.tsx:63` ("Make unavailable"), diluting what
  red means.
- **Recommendation:** Wrap the offer toggle's deactivate direction in the existing
  `ConfirmDialog` (activate direction can stay one-click — it is the safe direction).
  Longer-term, introduce a real switch/segmented control for reversible availability
  toggles and keep `destructive` for confirm-gated actions only.
- **Suggested command:** `$impeccable harden apps/admin/src/routes/(dashboard)/offers.$offerId.tsx`

#### [P1-2] Brutalist identity still not baked into base primitives (carried from rev. 1, partially improved)

- **Location:** `apps/admin/src/components/ui/button.tsx:11-39`, `ui/card.tsx:5-16`; consumer
  patches at `routes/login.tsx:46,79`, `(dashboard)/index.tsx:22`, `admin-home.tsx:20,28`,
  and 18 `shadow-[var(--shadow-offset-*)]` literals across 12 files
- **Category:** Theming / Anti-Pattern (design-system discipline)
- **Impact:** Improved since revision 1: `Button` now has universal `border-2 border-border`
  and `Card` picks up brand radius via `--radius`. Still missing from the primitives: the
  hard offset shadow, and the tactile press state (translate + shadow collapse) that defines
  the brand — the press state exists **only** on sidebar items (`app-sidebar.tsx:55`).
  Buttons across every CRUD screen are flat; cards only look brutalist where a consumer
  remembered the class string. The system still relies on developer discipline, and P5–P7
  will copy whichever variant their author happens to look at.
- **Recommendation:** Move `shadow-[var(--shadow-offset-sm)] active:translate-x-px
active:translate-y-px active:shadow-none` into `buttonVariants` base (default/secondary/
  destructive; exclude ghost/link), and add a `Card` default of `border-2 border-foreground
shadow-[var(--shadow-offset-md)]` (or a `flat` opt-out variant). Then delete the consumer
  copies. Also add first-class utilities (`shadow-offset-sm` is already a `--shadow-*` token —
  `shadow-offset-sm` etc. work as native Tailwind classes; prefer them over the `[var(…)]`
  arbitrary form everywhere).
- **Suggested command:** `$impeccable extract apps/admin/src/components/ui`

#### [P1-3] Sidebar semantic tokens never mapped to brand — mobile sheet renders stock-shadcn gray

- **Location:** `apps/admin/src/styles/globals.css:129-136` (`--sidebar: hsl(0 0% 98%)` etc.),
  `:186-195` (dead `.dark` block, also stock); `ui/sidebar.tsx:165,182` (`bg-sidebar
text-sidebar-foreground` — desktop container is overridden by `AppSidebar`'s
  `bg-background`, the mobile `SheetContent` is **not**), `:456-462` (menu hover/active use
  `sidebar-accent` grays under the custom classes)
- **Category:** Theming / Responsive
- **Impact:** On <768px viewports the sidebar opens as an off-brand light-gray sheet with
  gray hover states — the only place a store manager on a phone sees the nav. Desktop only
  looks right because `app-sidebar.tsx` out-muscles the tokens with overrides, which is the
  same consumer-discipline anti-pattern as P1-2.
- **Recommendation:** Map the `--sidebar-*` slots onto brand primitives in `:root`
  (`--sidebar: var(--color-cream)`, `--sidebar-foreground: var(--color-ink)`,
  `--sidebar-accent: var(--color-cream-tint-1)`, `--sidebar-border: var(--color-ink)`,
  `--sidebar-ring: var(--color-jgold)`, `--sidebar-primary: var(--color-jyellow)`), then
  strip the now-redundant overrides in `app-sidebar.tsx`. Delete or intentionally complete
  the `.dark` block (see P3-4).
- **Suggested command:** `$impeccable polish apps/admin/src/styles/globals.css`

#### [P1-4] No success feedback anywhere (silent mutations, feedback-free copy)

- **Location:** `features/offers/components/coupon-list.tsx:22-28,50` (Copy button, no state
  change); every mutation site (dialogs close silently on success: `branches.tsx`,
  `categories.tsx`, `products.index.tsx`, `deals.index.tsx`, `offers.index.tsx`,
  `promotions.index.tsx`); `generate-coupons-panel.tsx:120-124` (the one success message —
  invisible per P0-1, and not announced: no `role="status"`)
- **Category:** UX Flows & States / Accessibility
- **Impact:** An ops user cannot tell whether "Copy" worked, whether a reactivate landed, or
  (without squinting) whether coupons were issued. Errors are well-handled (`role="alert"`
  consistently); success is structurally absent. This gap compounds in P5–P7 (reward edits,
  order oversight).
- **WCAG/Standard:** WCAG 4.1.3 Status Messages (AA)
- **Recommendation:** Smallest fix: Copy button flips to "Copied ✓-icon" for 1.5s
  (local state); give the generate-success message `role="status"` + a visible treatment
  (P0-1). Right fix before P5: one brutalist toast component (2px ink border, hard shadow,
  jyellow surface) mounted in `(dashboard)/route.tsx`, used by all mutation `onSuccess`
  handlers.
- **Suggested command:** `$impeccable delight apps/admin/src/components`

#### [P1-5] Duplicate `<main>` landmarks and duplicate `<h1>`s on every screen

- **Location:** `routes/(dashboard)/route.tsx:60` renders `<main>`; every child page renders
  its own nested `<main className="… min-h-screen … p-8">` (`branches.tsx:77`,
  `categories.tsx:84`, `products.index.tsx:96`, `products.$productId.tsx:57`,
  `deals.index.tsx:85`, `deals.$dealId.tsx:87`, `offers.index.tsx:67`,
  `offers.$offerId.tsx:55`, `promotions.index.tsx:42`). Detail pages additionally render two
  `<h1>`s: `PageHeader` h1 ("Product"/"Deal"/"Offer") + a section `<h1>` with the entity
  name (`products.$productId.tsx:75`, `deals.$dealId.tsx:102`, `offers.$offerId.tsx:73`).
- **Category:** Accessibility / Info Hierarchy
- **Impact:** `<main>` inside `<main>` is invalid landmark structure (screen-reader region
  navigation breaks); two `<h1>`s per page flattens the outline. Visually, the nesting also
  stacks `p-4 md:p-8` (layout) + `p-8` (page) = up to 64px combined padding, and
  `min-h-screen` inside an already-min-h-screen flex column forces spurious scroll.
- **WCAG/Standard:** WCAG 1.3.1 Info and Relationships; HTML landmark conformance
- **Recommendation:** Change page wrappers to `<div>` (or a shared `PageShell` composite)
  without `min-h-screen`/`p-8` — let the layout own padding. Detail pages: `PageHeader`
  title becomes the entity name (it already accepts `title`), demote the section heading to
  `<h2>`.
- **Suggested command:** `$impeccable layout apps/admin/src/routes`

#### [P1-6] Targeted coupon issuance requires pasting a raw user UUID

- **Location:** `features/offers/components/generate-coupons-panel.tsx:93-103`
  (`placeholder="user UUID"`)
- **Category:** UX Flows & States / Info Density
- **Impact:** The bulk path is fine, but the targeted path assumes the admin has a customer's
  UUID on their clipboard — there is no user search anywhere in the app (Users & Roles nav
  is `disabled: true`). Practically this feature is unusable without psql. The coupon list's
  Recipient column compounds it (`Targeted · 3fa85f64…` — truncated UUID, no name).
- **Recommendation:** Ship a minimal customer lookup (email/name typeahead against a small
  admin users endpoint — `GET /api/admin/users` exists since ADM-001) feeding the field; show
  resolved name+email before submit. Same combobox primitive is needed twice more (phase-05
  reward `eligibleProductId` picker, free-mechanics P3 benefit-product picker) — build it
  once (see Design Guidance).
- **Suggested command:** `$impeccable shape customer-picker`

#### [P1-7] Cursor affordance and sub-target-size controls

- **Location:** `ui/button.tsx:12` (no `cursor-pointer` in base — Tailwind v4 preflight
  leaves buttons `cursor: default`; consumers patch ad hoc:
  `deal-create-wizard.tsx:276,289,303`); wizard remove control `deal-create-wizard.tsx:300-307`
  (bare `×` text button, ~16px hit area, color-only hover); native checkbox
  `generate-coupons-panel.tsx:74-78` and `branch-form.tsx:125` (unstyled ~13px box)
- **Category:** Accessibility / Responsive
- **Impact:** Most buttons in the app show a default arrow cursor (reads as broken on web);
  the remove/× target fails WCAG 2.5.8 minimum target size (24px); the checkboxes are tiny
  and off-brand. Default button height `h-9` (36px) passes WCAG AA for desktop but note the
  brand a11y guideline says 44px minimum — acceptable for a desktop back-office, but `xs`
  (24px) and `icon-xs` sit exactly at the floor.
- **WCAG/Standard:** WCAG 2.5.8 Target Size (Minimum)
- **Recommendation:** Add `cursor-pointer` to `buttonVariants` base (remove the ad-hoc
  copies); replace `×` with `<Button size="icon-sm" variant="ghost" aria-label=…><X/></Button>`;
  add a styled `Checkbox` primitive (2px ink border, jyellow check) and swap the two native
  checkboxes.
- **Suggested command:** `$impeccable adapt apps/admin/src/components/ui/button.tsx`

### P2 — Minor

#### [P2-1] Input is 1px-bordered while sibling selects are 2px — inside the same forms

- **Location:** `ui/input.tsx:11` (`border` = 1px, no color utility → currentColor);
  selects: `offer-form.tsx:33-34` (`border-2 border-foreground`),
  `deal-create-wizard.tsx:224`, `product-options-editor.tsx:102`, `product-form.tsx:72`,
  `deal-component-editor.tsx` (`border-2 border-border`)
- **Category:** Consistency / Theming
- **Impact:** Every form mixes 1px inputs with 2px selects; the brand rule is 2px ink borders.
  Three distinct select stylings exist because there is no `Select` primitive.
- **Recommendation:** `Input` → `border-2 border-border`; add `ui/select.tsx` (styled native
  select is fine) and replace the five hand-styled instances.

#### [P2-2] `text-destructive` body text on cream is ≈4.2:1 — just under AA

- **Location:** every error `<p role="alert" class="text-sm text-destructive">` (~15 sites);
  `status-badge.tsx:16` warning tone (`text-destructive` at 12px bold on `bg-destructive/10`,
  small text ⇒ needs 4.5:1); savings warning panels (`deal-create-wizard.tsx:344`,
  `deals.$dealId.tsx:159`)
- **Category:** Accessibility
- **Impact:** `#E81E26` on `#FFF6E6` computes to ≈4.2:1 — fails 4.5:1 for the 12–14px
  non-large text these all use. Near-miss, but it is the app's entire error channel.
- **WCAG/Standard:** WCAG 1.4.3
- **Recommendation:** Add `--color-jred-text: var(--color-red-dark)` (`#c01020` ≈ 5.4:1 on
  cream) and point `--destructive`-as-text uses at it (keep `#E81E26` for fills with white
  text, which passes at 4.5:1). One token edit fixes all sites.

#### [P2-3] Dialogs are full-bleed on narrow viewports; ConfirmDialog can overflow

- **Location:** `components/form-dialog.tsx:35`, `confirm-dialog.tsx:50`, inline dialog
  copies in `branches.tsx:104`, `categories.tsx:109`, `products.index.tsx:125` (`w-full
max-w-md/-lg` centered, no viewport inset); `confirm-dialog.tsx` lacks
  `max-h-[90vh] overflow-y-auto` (FormDialog has it)
- **Category:** Responsive
- **Impact:** Below the max-width the dialog touches screen edges (hard shadow clips
  off-screen); a tall ConfirmDialog (with `children` like a policy radio group) can extend
  past the viewport with no scroll.
- **Recommendation:** `w-[calc(100%-2rem)]` (or `max-w-[calc(100vw-2rem)]`) on both contents;
  copy FormDialog's max-height/overflow to ConfirmDialog.

#### [P2-4] Loading states are bare text; the `Skeleton` primitive has zero consumers

- **Location:** `components/query-states.tsx:29-31` (`<p>Loading…</p>` for every list/detail);
  `ui/skeleton.tsx` (unused outside `ui/sidebar.tsx`)
- **Category:** UX Flows & States / Performance (perceived)
- **Impact:** Every screen flashes a one-line "Loading…" then jumps to a full table — layout
  shift and a low-craft feel, precisely where an ops user lands 50 times a day.
- **Recommendation:** Give `QueryStates` an optional `skeleton` slot; provide a
  `TableSkeleton` (3–5 shimmering rows inside the same 2px-border table frame) used by
  `DataTable` automatically. Reserve space to kill the jump.

#### [P2-5] Two status-display conventions and three list generations coexist

- **Location:** hand-rolled everything: `branch-list.tsx` (own loading/error/empty + table);
  half-migrated: `product-list.tsx`, `category-list.tsx` (QueryStates + hand-rolled table,
  plain-text `Active`/`Inactive`); fully migrated: `deal-list`, `offer-list`,
  `promotion-list`, `coupon-list` (DataTable), with `StatusBadge` on deals/offers/promotions
  but **not** branches/products/categories/coupons (`coupon-list.tsx:33` renders raw
  lowercase `available`/`redeemed`/`expired`); `branches.tsx` also still hand-rolls
  `PageHeader` and `FormDialog` markup, and `deactivate-branch-dialog.tsx` predates
  `ConfirmDialog`
- **Category:** Consistency
- **Impact:** Four screens built at four moments each look and behave slightly differently
  (status vocabulary, header layout, dialog chrome). New phases will fork from a random one.
- **Recommendation:** One mechanical migration pass: branches/products/categories →
  `DataTable` + `PageHeader` + `FormDialog` + `ConfirmDialog` + `StatusBadge`
  (via `entity-status`-style derivations); coupon status → `StatusBadge` tone map
  (`available`→success, `redeemed`→muted, `expired`→neutral); delete
  `deactivate-branch-dialog.tsx`.

#### [P2-6] Silent validation drops in OfferForm

- **Location:** `features/offers/components/offer-form.tsx:123-130` (non-integer/≤0 usage
  limits are silently omitted from the payload, no error); `:114-121` (empty discount value
  for a scalar mechanic submits with no `discountValueCents` — server becomes the only gate,
  error wording is the server's)
- **Category:** UX Flows & States
- **Impact:** Typing "2.5" in "Usage limit / user" creates an unlimited offer with zero
  warning — a real promo-budget hazard.
- **Recommendation:** Validate like the other fields (`setLocalError`) instead of dropping;
  require a discount value when `hasScalarValue(offerType)`.

#### [P2-7] Percent value travels through a `discountValueCents` field

- **Location:** `offer-form.tsx:114-121` (`v * 100` for both ₱ and %),
  `admin-offers-api.ts:53` (`discountValueCents: number | null`), `offer-list.tsx:35-40`
  (`discountValueCents / 100` → `%`)
- **Category:** Consistency (naming) / correctness trap
- **Impact:** For `percentage_discount`, "10" (%) is encoded as `1000` in a field named
  _cents_; it round-trips only because the server symmetrically applies
  `centsToNumeric`. The public serializer documents the opposite convention ("percentage —
  NOT ×100"). First maintainer to "fix" either side breaks live discounts.
- **Recommendation:** Rename the wire field (`discountValue` + unit doc) or split
  (`percentValue` / `amountCents`) at the admin boundary while it is still low-traffic;
  minimum: loud comments at all three sites.

#### [P2-8] `datetime-local` windows have no timezone affordance

- **Location:** `offer-form.tsx:207-226`, `promotion-form.tsx:71-90`,
  `generate-coupons-panel.tsx:105-112`
- **Category:** UX Flows & States
- **Impact:** Values are converted with `new Date(local).toISOString()` — interpreted in the
  admin's browser TZ, displayed back the same way, with no hint. Phase-07 locks analytics to
  Asia/Manila; offer/promotion windows should state the same assumption or a
  wrong-timezone laptop silently shifts a campaign by hours.
- **Recommendation:** Helper text under window fields ("Times are in Philippine time" once
  server-side normalization matches, or "your local time" today); reuse phase-07's Manila
  boundary convention for consistency.

#### [P2-9] Wizard allows creating a deal that is invisible everywhere, without warning

- **Location:** `deal-create-wizard.tsx:364-399` (branch toggles; excluding all branches
  sends `branchIds: []`), cross-ref `lib/entity-status.ts:40-56` (the list then shows the
  warning badge only after the fact)
- **Category:** UX Flows & States
- **Impact:** The seeding bug behind backlog note
  `deal-availability-seeding-and-status-indicators_NOTE_16-07-26.md` is fixed, but the UI
  still permits the "invisible deal" end-state silently at create time.
- **Recommendation:** When every branch is toggled off, show an inline warning row ("This
  deal won't be visible at any branch") next to the Create button — allow, but inform. Also
  disable "Create deal" until `step1Valid` still holds (currently only items/price are
  re-checked at step 2; a slug cleared after going back would submit).

#### [P2-10] Render-blocking third-party font `@import`

- **Location:** `styles/globals.css:15` (Google Fonts `@import url(…)` inside the stylesheet)
- **Category:** Performance
- **Impact:** CSS `@import` serializes font CSS fetch behind the stylesheet; adds a
  third-party request chain to first paint of an SSR app, and FOUT on every cold load.
- **Recommendation:** Self-host via `@fontsource/fredoka` + `@fontsource/plus-jakarta-sans`
  (imports in the root route), or at minimum move to `<link rel="preconnect">` +
  `<link rel="stylesheet">` in `__root.tsx` head.

#### [P2-11] Wizard step change is invisible to assistive tech; step rail is decorative

- **Location:** `deal-create-wizard.tsx:153-173` (ol/li rail, no `aria-current`, focus stays
  on the clicked "Next" button which unmounts)
- **Category:** Accessibility
- **Impact:** Screen-reader users get no announcement that the dialog content swapped to
  step 2; the rail communicates progress by color only.
- **Recommendation:** `aria-current="step"` on the active li; move focus to the step-2
  heading (or give the wizard container `aria-live="polite"` label "Step 2 of 2 — Items &
  Pricing").

### P3 — Polish

#### [P3-1] Back-links are `<button>`s, not links

- **Location:** `page-header.tsx:20-28`, `branches.tsx:80-86`
- **Category:** Accessibility / UX
- **Impact:** "← Products" cannot be middle-clicked/cmd-clicked or seen as navigation by AT;
  the sidebar correctly uses `Link`.
- **Recommendation:** Accept a `backTo` route and render TanStack `<Link>`; drop `onBack`.

#### [P3-2] Table headers lack `scope`; DataTable has no caption/aria-label

- **Location:** `components/data-table.tsx:64-71`, hand-rolled tables in
  `branch-list.tsx`/`product-list.tsx`/`category-list.tsx`
- **Recommendation:** `scope="col"` on `<th>`; optional `aria-label` prop on `DataTable`.

#### [P3-3] `beforeLoad` re-fetches `/api/admin/me` on every in-group navigation

- **Location:** `routes/(dashboard)/route.tsx:38-50`
- **Impact:** One extra round-trip per sidebar click (guard is convenience-only by its own
  doc comment; server still protects data).
- **Recommendation:** Cache the check for ~30s (module-level timestamp) or move it to the
  react-query client with `staleTime`.

#### [P3-4] Dead dark-mode scaffolding in a light-only app

- **Location:** `globals.css:21` (`@custom-variant dark`), `:186-195` (`.dark` sidebar
  overrides — stock grays), `dark:*` classes in `ui/button.tsx`, `ui/input.tsx`
- **Impact:** Light-mode-only is a documented, acceptable call for this back-office (flagged
  here as **verified acceptable** — an ops tool used in shop conditions on desktop; revisit
  only if staff request it). But the half-wired `.dark` remnants suggest support that doesn't
  exist and will mislead future work.
- **Recommendation:** Delete the `.dark` block and stray `dark:` utilities, and add a
  one-line comment in `globals.css` declaring light-only intent; or fully theme dark later.

#### [P3-5] Small chrome polish batch

- **Location & items:**
  - `nav-user.tsx:29` — role renders raw (`super_admin`); title-case a label map.
  - `deals.$dealId.tsx:103` — `dealStatus(deal)` called twice per render; compute once.
  - `status-badge.tsx:29` — a 4px hard shadow on a 12px chip is visually heavy at table
    density; consider a 2px chip shadow token.
  - `app-sidebar.tsx:52-58` — disabled "Users & Roles" item is still rendered as a Link with
    `cursor-not-allowed`; prefer omitting `to` or `aria-disabled` + `tabIndex={-1}`.
  - `components.tsx:29` — showcase uses off-scale `text-3xl` + `text-ink` instead of
    `text-display`/`text-foreground` tokens (dev-only, but it is the reference page).

## Patterns & Systemic Issues

1. **Token system is right; token _use_ is the gap.** The three-layer mapping
   (`@theme` primitives → `:root` shadcn slots → `@theme inline` remap) works — stock
   primitives render on-brand. But jyellow gets used as text (P0-1), sidebar slots were
   never mapped (P1-3), and signature shadows/press states live in 18 consumer literals
   (P1-2). The system needs the last mile: primitives that _guarantee_ the brand.
2. **Four component generations.** branches (gen 1, all hand-rolled) → products/categories
   (gen 2, QueryStates only) → deals (gen 3, DataTable/FormDialog) → offers/promotions
   (gen 4, + StatusBadge). Nothing migrates backward, so every convention exists in 2–4
   variants (P2-5). Establish "newest composite set is mandatory; migrate one older screen
   per phase."
3. **Error channel mature, success channel absent.** `role="alert"` + mutation error
   surfacing is consistently good; success feedback is structurally missing (P1-4).
4. **Density tuned for a demo, not ops.** `max-w-4xl`/`max-w-3xl` center-column layouts,
   no search/filter/counts on any list, dashboard home is an empty welcome card. Fine at 5
   rows per table; phases 6–7 (orders, analytics) are explicitly high-density and the
   current shell gives them nothing to build on.

## Positive Findings

- **Committed, distinctive brand** — the jyellow/ink/cream system with hard offset shadows
  and Fredoka display reads as designed, not generated; sidebar active states nail the
  tactile spec (translate + shadow collapse).
- **Strong safety patterns where applied:** `ConfirmDialog` gates all destructive CRUD +
  price changes with honest copy ("historical orders keep their prices"),
  `DestructiveButton` has a click-to-confirm affordance, dialogs block Escape/outside-click
  while pending.
- **Solid a11y baseline in places:** consistent `role="alert"`, labels wrap inputs in every
  form, `aria-pressed` on wizard branch toggles, `aria-label` on icon quantity buttons,
  radix dialogs give focus traps + sr-only descriptions (`form-dialog.tsx:43-46`),
  `html lang="en"` set.
- **Good state discipline:** `QueryStates` keeps cached rows visible on background refetch
  errors; reactivation errors deliberately surface beside the list instead of a closed
  dialog; deal savings panel avoids the false "costs more" flash by waiting for prices.
- **`entity-status.ts` is exactly right** — pure derivations, documented semantic asymmetry
  (deal vs offer vs promotion visibility), warning state for the "active but invisible" trap.
- **Live price-comparison panels** (wizard + deal detail) are genuinely good ops UX: honest
  negative-savings warning, preview-not-saved note, per-line breakdown.

## Design Guidance for Upcoming Screens (planned surface — plans may still be in flux)

Audited against `phase-05-rewards_PLAN`, `phase-06-orders_PLAN`, `phase-07-analytics_PLAN`
(all DRAFT, 17-07-26) and `adm-008-free-mechanics_PLAN` P3.

### Shared prerequisite: one `EntityPicker` combobox, built once

Three planned features each need "pick an entity from a searchable list": phase-05 reward
`eligibleProductId` (free_item), free-mechanics P3 `benefitProductId`, and the targeted-coupon
customer field (P1-6). Do **not** ship three more hand-styled `<select>`s (there are already
five). Build one brutalist combobox (2px ink border, typeahead, jyellow active option, hard
shadow popover — beware `overflow: hidden` ancestors: portal it) and use it in all three.
Plans currently say "select fed by the products list" — fine for ≤20 products, but specify
the composite so the pattern doesn't fork again.

### Phase 5 — Rewards config CRUD

- Reuses the gen-4 composite set (DataTable/FormDialog/ConfirmDialog/StatusBadge) — correct.
  Fix P0-1/P1-2 **before** this phase so the 5th consumer copies clean patterns.
- `required_stars` edit confirmation (plan Safety §3) should reuse `ConfirmDialog` with the
  plan's exact copy ("affects future unlock crossings only…") — mirror the price-change
  dialog's honest-copy precedent.
- Type-conditional fields (D4: free_item ⇒ product picker; discount ⇒ value input) must
  visibly clear/hide on mechanic switch — same conditional-reveal pattern OfferForm already
  has; add the validation OfferForm lacks (P2-6) rather than copying the silent-drop bug.
- Rewards list: show `required_stars` ascending (plan already orders it) with the star count
  as the primary visual column — it is the natural sort key admins reason about.

### Phase 6 — Admin orders view (read-only oversight)

- **First filter bar in the app** (branch select + status select + date range). This becomes
  the de-facto pattern for P7 and future lists — spec it as a composite (`FilterBar`) with
  labeled controls, an active-filter count, and a one-click "Clear filters", not three bare
  selects in a row.
- **Status badges:** `StatusBadge` has 4 generic tones; orders have 8 statuses
  (`pending…rejected`). Add an order-status→tone map to `entity-status.ts` (e.g. pending/
  preparing/flavoring=neutral, ready=success, completed=muted, cancelled/rejected=warning)
  instead of inventing a second badge. `packages/ui`'s RN `STATUS_META` is the vocabulary
  precedent — keep labels identical across staff app and admin.
- **Read-only affordance:** plan D1 locks no-mutation. Make that legible: no action column at
  all (don't render disabled buttons), and a quiet "View-only" note in the page header so
  admins don't hunt for a status button that exists in the staff app.
- **Density:** this is the first unbounded list — drop the `max-w-4xl` habit here; full-width
  table, `tabular-nums` for money/date columns, cursor "Load more" button styled as a
  full-width secondary row (plan D3). Reserve row height during pagination fetch (P2-4
  skeleton) to avoid jumps.
- **PII restraint (plan D2):** show name + phone in the detail customer block only — don't
  add them as list columns by default; the list needs order number, branch, status, placed
  time, total.

### Phase 7 — Analytics dashboard (stat tiles in a brutalist system)

- **What NOT to do:** the impeccable ban list names the exact trap for this screen — the
  "hero-metric template" (big gradient number, tiny label, identical card grid). With six
  metrics the lazy output is a 3×2 grid of identical cards. Differentiate by importance:
  orders/AOV as the two lead tiles (larger, `font-display`, `tabular-nums`), the
  rewards/stars quartet as a compact secondary row or a single grouped panel; per-branch
  table below. No gradients, no sparkline-for-decoration; hard borders + one jyellow accent
  surface maximum per view.
- **`metric-card` composite (plan D6):** 2px ink border, `shadow-offset-sm`, cream surface,
  label in caption-size Plus Jakarta, value in Fredoka `tabular-nums`. Must have explicit
  `null`/empty states: AOV is `number | null` by contract — render "—" with a "no orders in
  range" sub-label, never ₱0.00 (the plan already forbids fake zeros server-side; the UI
  must match).
- **Scope honesty:** stars/rewards metrics are program-wide even when a branch filter is set
  (`branchScoped: false`). Label those tiles "All branches" whenever a branch is selected —
  silently mixing scopes in one row of tiles is the biggest misread risk on this screen.
- **Time-range picker:** presets (7/30 days) as segmented buttons + custom from/to; state the
  timezone ("Philippine days", plan D3) right in the picker's helper text — resolves P2-8's
  ambiguity for at least this screen. Changing range must show a loading state on tiles
  (skeleton shimmer inside the tile frame), not a blank flash.
- **If charts come later:** per the repo's dataviz guidance, brutalism tolerates bar/column
  charts with flat brand-token fills and 2px ink axes; avoid soft gridlines, gradients, and
  more than the 5 mapped `--chart-*` hues.

### Free-mechanics P3 — benefit picker + generate-panel block

- The plan's disabled-generate-with-reason pattern ("button disabled + reason text") is
  right; implement the reason as visible text adjacent to the button **and** associate it
  (`aria-describedby` on the button) — a disabled button alone is a dead-end for AT users.
- Benefit picker appears only for `free_item`/`free_upgrade` (plan): animate/structure the
  conditional reveal identically to phase-05's D4 conditional fields — one shared
  conditional-field convention, defined once.
- When an offer is free-mechanic and unconfigured, the offer **detail** page should surface
  the same warning state via `StatusBadge` warning tone ("Needs benefit product") — the
  entity-status pattern already models "active but broken" for deals; extend it rather than
  leaving the panel block as the only signal.

## Prioritized Remediation Roadmap

**Quick wins (hours, do before any new phase ships UI):**

1. [P0-1] Swap `text-primary` → `text-foreground` in `page-header.tsx` + 4 inline `<h1>`s;
   restyle the coupon success message + availability label. (~7 one-line edits)
2. [P2-2] Add a darker red text token; repoint error text. (1 token + 1 class convention)
3. [P1-7 part] `cursor-pointer` into `buttonVariants` base; replace the wizard `×` with an
   icon button.
4. [P1-1] Wrap offer deactivation in the existing `ConfirmDialog`.
5. [P1-4 part] Copy-button "Copied" state; `role="status"` + visible styling on the
   generate-success message.
6. [P2-3] Dialog viewport inset + ConfirmDialog max-height.

**Structural (1–2 focused passes, before/alongside Phase 5):**

7. [P1-2] Bake shadow + press state into `Button`/`Card`; delete 18 consumer shadow
   literals; adopt native `shadow-offset-*` utilities.
8. [P1-3] Map `--sidebar-*` slots to brand tokens; strip `AppSidebar` overrides; delete the
   dead `.dark` block [P3-4].
9. [P1-5] `PageShell` (single `<main>`, layout-owned padding); one `<h1>` per page.
10. [P2-5] Migrate branches/products/categories to the gen-4 composite set; StatusBadge
    everywhere incl. coupon status; delete `deactivate-branch-dialog.tsx`.
11. [P2-1] `Input` to 2px; add `ui/select.tsx`; replace 5 hand-styled selects.
12. [P2-4] `TableSkeleton` wired through `DataTable`/`QueryStates`.
13. [P1-6 / shared prerequisite] Build `EntityPicker` combobox + minimal customer lookup;
    reuse for phase-05/free-mechanics pickers.
14. [P1-4] Brutalist toast for mutation success (before Phase 5's confirm-heavy flows).

**Forward guardrails (encode in phase plans):**

15. Phase-06: `FilterBar` composite + order-status tone map in `entity-status.ts`; no
    disabled action buttons on read-only screens; full-width density.
16. Phase-07: `metric-card` with mandatory null/empty states + scope labels; no hero-metric
    grid; timezone named in the picker.
17. Free-mechanics P3: `aria-describedby` on the blocked generate button; "Needs benefit
    product" warning status on offer detail.
18. Adopt the migration rule: every new phase leaves the composite set strictly more
    consistent than it found it (one legacy screen migrated per phase).
