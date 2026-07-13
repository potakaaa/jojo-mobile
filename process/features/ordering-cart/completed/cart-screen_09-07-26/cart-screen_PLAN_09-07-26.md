# Cart Screen (CART-001) — Implementation Plan

## SUPERSEDED (13-07-26) — archived without ever being executed on this branch

**This plan was never executed.** While it sat VALIDATED/EXECUTE-ready on this branch, teammate
`development` independently built and shipped its own CART-001 cart screen (PR #62) with a
different, richer `Cart`/`CartItem`/`CartItemOption`/`AppliedDiscount`/`CartSessionProvider` type
and state model — not the `CartItem`/`Cart` shape this plan designed below. When `development` was
merged into this branch, the user chose development's model as canonical (see
`process/general-plans/completed/merge-cart-reconciliation_13-07-26/`), and this branch's real
backend wiring was ported onto it instead of onto this plan's design.

**Net effect:** CART-001's product requirement (a working cart screen with items, quantities,
totals, coupon slot) IS satisfied in the codebase today — just via a different implementation path
(development's screen + this branch's backend, reconciled by the merge) than the one this plan
specifies. This plan's own Architecture Decisions (A1-A7), Public Contracts, and Implementation
Checklist below describe a design that was **never built** — do not use this file as a description
of the current cart architecture. See `process/features/ordering-cart/_GUIDE.md` and
`process/context/all-context.md` §"Cart architecture (superseded)" for what actually shipped.

Archived as **Obsolete** (superseded by independent work + a subsequent merge reconciliation), not
Completed — no code in this plan's Implementation Checklist was ever written on this branch.

---

**Feature:** ordering-cart
**Issue:** [CART-001] [P0] Cart screen with items, quantities, totals, and coupon slot (#17)
**Milestone:** Phase 1: Customer App Core
**Date**: 2026-07-09
**Status**: SUPERSEDED (13-07-26) — see note above. Was: Planning complete — VALIDATED (10-07-26, Gate: PASS). HOLD CLEARED (auth merged, `85ee923`) — EXECUTE-ready pending explicit "ENTER EXECUTE MODE". See §Dependencies & Hold and §Validate Contract.
**Complexity**: COMPLEX (new state seam + 3 new shared components + domain-type extensions + data-model decisions with backend-alignment implications)
**Context**: see `process/context/all-context.md` (repo router)
**Author:** orchestrator (synthesized from 6 parallel research agents, 2026-07-09); validated by vc-validate-agent (10-07-26)

---

## Overview (Context and Goals)

### Goal
Deliver the Cart screen exactly as CART-001 specifies: selected branch, line items (name, size/flavor/options, quantity, line price), subtotal, discount, total, estimated pickup time, applied coupon/deal, reward-redemption slot; with per-line quantity +/−, qty→0 removal, individual remove, reactive recalculation, persistence across backgrounding, and a deterministic single-branch cart rule.

### Current reality (research-verified)
- **The Cart route already exists as a placeholder.** `apps/mobile/src/app/(tabs)/order/cart.tsx` is a `<ComingSoon title="Cart" isNestedScreen>` with a dev link to Checkout. Its `Stack.Screen name="cart"` is already registered in `apps/mobile/src/app/(tabs)/order/_layout.tsx` with `title: 'Cart'`. **CART-001 replaces the placeholder body — it adds no navigation.**
- **No cart state exists anywhere.** No `use-cart`, `CartProvider`, or `features/cart/` folder. Greenfield at the screen + state level.
- **No state library and no storage dependency are installed** (grep across every `package.json`: zero matches for zustand/redux/jotai/valtio/tanstack/async-storage/secure-store/sqlite/mmkv). The state-seam precedent is `apps/mobile/src/features/auth/hooks/use-auth.ts` — a plain React Context (`AuthProvider`/`useAuth()`) backed by better-auth. **(VALIDATE correction, 10-07-26: the plan originally cited `use-auth-session.ts`, which was deleted and replaced by `use-auth.ts` — see A1/A3.)**
- **The presentational row already exists.** `@jojopotato/ui`'s `<CartItem>` renders image, name, flavor•size line, computed line total, and a built-in ± stepper (with a tested `__tests__/cart-item.test.tsx`). Eight UI components are direct-fit reuse (see §UI Reuse Map).
- **The backend schema is fully built but has zero consumers.** `packages/api` has 13 Drizzle tables (products, product_options, branches, branch_product_availability, deals, coupons, orders, order_items, …). CART-001 does **not** touch the backend, but the cart data model should align with `order_items` so a later checkout ticket needs no renaming.

### Scope boundary
- **In scope:** cart state seam, cart screen UI, quantity/remove/recalc logic, single-branch rule, empty-cart state, coupon/reward *slots* (display + apply-affordance wired to cart state), 3 new/extended `@jojopotato/ui` components, cart domain-type extensions.
- **Out of scope (CART-002 / later):** checkout, order creation, payment method, real backend reads/writes, real coupon/deal *pricing engine* math, auth wiring. The coupon/reward slots render and accept an applied discount object but the discount-computation engine is stubbed behind a documented interface (see §Decisions Required D1/D2).

### Every CART-001 requirement → where it is satisfied
| Requirement | Satisfied by |
|---|---|
| Show selected branch | `<BranchCard>` header, fed by `cart.pickupBranchId` → `PickupBranch` |
| Line items: name, size/flavor/options, qty, line price | `<CartItem>` (existing), one per `cart.items[]` |
| Subtotal / discount / total | new `<CartSummary>` (§UI Gaps), derived reactively in `useCart()` |
| Estimated pickup time | `<PickupTimeBadge>`, derived from `branch.estimatedPrepMinutes` (D5) |
| Applied coupon/deal | `<CouponCard>` + apply-affordance; `cart.appliedDiscount` |
| Reward redemption | reward slot in `<CartSummary>` (D2) |
| Qty +/− per line | `<CartItem>` stepper → `useCart().updateQuantity` |
| Qty→0 removes item | `updateQuantity` collapses to `removeItem` at 0 (D-note: not in PRD, product-confirmed UX) |
| Individual remove | new `onRemove` prop on `<CartItem>` (§UI Gaps) → `removeItem` |
| Reactive recalc | `useMemo` over `items` + `appliedDiscount` in provider |
| Persist across backgrounding | in-memory Context above the navigator (Tier A — free; see §Persistence) |
| Single-branch cart | provider enforces on `addItem` (D4) |

---

## Research Foundation (every decision below is backed)

Six parallel research agents (2026-07-09) covered PRD, mobile structure, domain types, UI inventory, DB schema, and state/persistence. Their reports are the evidence base; key citations are inline throughout this plan. Summary of load-bearing findings:

1. **PRD (`docs/jojo-potato-mobile-prd.md` §6.5):** the cart display field list matches CART-001 one-to-one. But the PRD is data-model/flow-level, not an interaction spec — it does **not** define discount stacking, reward-redemption mechanics, cart persistence, single-branch enforcement, qty-to-zero removal, the total formula, empty-cart state, or the Cart↔Checkout screen split. → these become **Decisions Required** (below), not silent inferences.
2. **Mobile structure:** cart route + Stack already exist; mirror `use-auth.ts` (corrected 10-07-26); mount provider in root `_layout.tsx`; new `features/cart/` folder.
3. **Types (`packages/types/src/cart.ts`):** `CartItem { menuItemId, quantity, notes? }` and `Cart { id, items, pickupBranchId }` are skeletons — every other required field is absent but composable from existing sibling types (`Flavor`, `Size`, `Coupon`, `Deal`, `PickupTime`, `PickupBranch`).
4. **UI:** 8 direct-fit components; 3 gaps (remove affordance, `CartSummary`, `EmptyState`); strict theme-token conventions (`mode` prop, no raw hex/px — enforced by `packages/ui/scripts/check-raw-tokens.mjs`).
5. **DB schema (`packages/api`):** pricing = `base_price + Σ(option price_delta)`, snapshotted into `order_items` at order time; discounts only aggregate at `orders.discount_total`; availability is per-product-per-branch only; `order_items.selected_options` jsonb has **no defined shape** anywhere. Several `packages/types`↔schema mismatches exist (cents vs decimal, `order_status` enum values, coupon model) — noted as future-integration debt, non-blocking for CART-001.
6. **State/persistence:** in-memory Context satisfies the literal acceptance criterion; no new dependency needed. Storage-backed (app-kill) persistence is **ruled out by the lead dev (no AsyncStorage, 2026-07-09)** — force-quit clears the cart by design.

---

## Architecture Decisions (LOCKED — research-backed)

### A1. State container: React Context, mirroring `use-auth.ts` — no new dependency
> **VALIDATE correction (10-07-26):** `use-auth-session.ts` no longer exists on this branch — it was deleted and replaced by `apps/mobile/src/features/auth/hooks/use-auth.ts` (`AuthProvider`/`useAuth()`, backed by better-auth; confirmed via `process/context/all-context.md` §Current Implementation State and direct file read). Mirror **`use-auth.ts`'s** Context pattern: `createContext`/`useContext`/`useMemo`/`useCallback`, with a throw-if-used-outside-provider guard in `useCart()` (same shape as `useAuth()`'s `if (!ctx) throw new Error(...)`).

`CartSessionProvider` + `useCart()` using only `useState`/`useContext`/`useMemo` (already installed via `react`). Rationale: repo has zero state-management deps and the sole state-seam convention is auth's in-memory Context (`use-auth.ts`); Context's re-render granularity is a non-issue at cart scale; adding Zustand for one provider violates the documented "minimal deps" ethos (`all-context.md`) and YAGNI. Backed by state/persistence research (grep: zero state-lib matches) and `use-auth.ts` precedent.

### A2. Persistence: in-memory only for CART-001 (LOCKED by lead dev — no AsyncStorage)
The acceptance criterion — *"not lost if the user leaves and returns before checkout"* — is **Tier A** (app backgrounded/navigated-away, JS process alive). In-memory Context state held **above the navigator** satisfies this for free, exactly as `hasOnboarded` already survives backgrounding in auth. **Tier B** (survive app force-quit/relaunch) needs AsyncStorage and is explicitly **out of scope**: the lead dev has ruled **no AsyncStorage** (2026-07-09). No storage dependency is added; force-quit clears the cart by design. This closes D3 — no follow-up storage work, no backlog note.

### A3. Mount point & provider order
> **VALIDATE correction (10-07-26):** the real provider in `apps/mobile/src/app/_layout.tsx` is `AuthProvider` (from `use-auth.ts`), not `AuthSessionProvider`. Confirmed current structure by direct read: `<ThemeProvider><AuthProvider><RootNavigator /></AuthProvider><StatusBar /></ThemeProvider>`.

`CartSessionProvider` wraps `<RootNavigator />`, nested **inside** `AuthProvider`:
```tsx
<ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
  <AuthProvider>
    <CartSessionProvider>
      <RootNavigator />
    </CartSessionProvider>
  </AuthProvider>
  <StatusBar style="auto" />
</ThemeProvider>
```
(cart is conceptually per-user; nesting inside `AuthProvider` lets a future version read auth without re-parenting). Current auth state has no such dependency, so this is a forward-compatible choice, not a hard requirement.

### A4. Screen implementation: replace the placeholder body
Edit `apps/mobile/src/app/(tabs)/order/cart.tsx` in place. Keep the `isNestedScreen` safe-area behavior (framed by the native Stack header, not the floating tab bar). No `_layout.tsx` / Stack changes.

### A5. Data model: mobile-local cents convention, aligned to `order_items` shape
Keep the app's existing **integer `priceCents`** convention (used by `MenuItem`, `formatCurrency`) rather than the DB's `numeric(10,2)` decimal-string — reconciling units is a future backend-integration ticket, not CART-001. The extended cart line item mirrors `order_items` field-for-field so checkout write-through needs no renaming (see §Public Contracts). The `selectedOptions` shape is **originated here** (the DB jsonb is undefined) — define it as `{ optionType: 'size'|'flavor'|'add_on'; id; name; priceDeltaCents }[]`.

### A6. Pricing: snapshot at add-to-cart
Line `unitPriceCents = product.priceCents + Σ(selectedOptions.priceDeltaCents)`, captured when the item is added (mirrors `order_items.unit_price` snapshot semantics). `lineTotalCents = unitPriceCents × quantity`. `subtotalCents = Σ lineTotalCents`. `totalCents = subtotalCents − discountTotalCents`. ⚠ Whether existing lines **live-reprice** if the catalog price changes is a PRD gap (D6) — default: snapshot (no live reprice) until checkout re-validation, matching the PRD's "product price changes before checkout" edge case being a *checkout* concern.

### A7. Single-branch cart: enforce in the provider
`Cart.pickupBranchId` already encodes single-branch scoping, and `orders.branch_id` is one-branch-per-order. `addItem` with a product from a different branch triggers a deterministic **"Clear cart and switch branch?"** confirm (block-or-clear, never a silent mixed-branch cart). Exact copy/UX is a UI-workflow output (§UI/UX Workflow). Backed by types + DB (one `branch_id` per order).

---

## Decisions Required (PRD gaps — RESOLVED via session decision, 10-07-26)

These are genuine PRD gaps (PRD research §5). **Session decision (10-07-26, lead dev): D1–D9 are ALL ACCEPTED as their documented proposed defaults below** — no further PM confirmation is blocking EXECUTE. (D3 was already resolved earlier: Tier A, no AsyncStorage — see A2.)

| ID | Question | Accepted default (10-07-26) |
|---|---|---|
| **D1** | Discount stacking: can a deal + reward coupon apply together? Multiple deals? Order of % vs fixed? | **One active discount at a time** (PRD uses singular "coupon/deal" and a single `discount_total`). Cart holds one `appliedDiscount`. |
| **D2** | Reward-redemption mechanics in-cart: how does a reward become a discount/free item? | Model reward redemption as a coupon-shaped `appliedDiscount` (reward coupons are `coupons` rows per schema). Free-item rewards deferred to CART-002/pricing-engine. |
| **D3** | ~~"Persist across backgrounding" = Tier A (background) or Tier B (force-quit)?~~ **RESOLVED 2026-07-09 (lead dev): Tier A only, no AsyncStorage.** | **Tier A** (in-memory, no dep). Force-quit clears the cart by design. See A2. |
| **D4** | Mixed-branch add: block or prompt-to-clear? | **Prompt to clear + switch** (deterministic, documented). |
| **D5** | Estimated pickup-time formula for an unplaced cart | `now + branch.estimatedPrepMinutes` (display-only estimate; the authoritative `estimated_ready_at` is set at order time). |
| **D6** | Existing cart lines: live-reprice on catalog change, or snapshot? | **Snapshot** at add-time; re-validate at checkout (CART-002). |
| **D7** | Empty cart: can the user reach Checkout? Empty-state copy? | Empty-state blocks Checkout CTA; copy from UI/UX workflow. |
| **D8** | Tax / fees / rounding | **None** — `total = subtotal − discount` (PRD names no tax/fee). Revisit if product adds them. |
| **D9** | Coupon re-validation timing (expiry/usage/eligibility) | Light client check on apply; authoritative re-validation at checkout (CART-002). |

**All rows above: ACCEPTED — 10-07-26 (lead dev, this session).**

---

## UI/UX Workflow (MANDATORY — applies to every screen/component step below)

All UI design and build work in this plan follows a two-step skill pipeline. **Do not hand-author cart UI directly.**

1. **Plan/design with `ui-ux-pro-max`.** For each cart UI surface (screen layout, `<CartSummary>`, `<EmptyState>`, the `<CartItem>` remove affordance, the branch header, the coupon/reward slot, the mixed-branch confirm dialog), invoke the **`ui-ux-pro-max`** skill to produce the design: layout, hierarchy, states (default / empty / one-item / many-items / discount-applied / branch-unavailable), spacing, motion, and component composition — expressed against the existing `@jojopotato/ui` theme tokens (`Palette`, `Colors[mode]`, `Spacing`, `Radii`, `Shadows`, `FontFamily`, `TypeScale`) and the flat "comic" offset-shadow brand signature. **Constrained to existing tokens (session decision, 10-07-26): `theme.ts` + existing components are the only allowed source of style values — no new hexes/px.**
2. **Audit the output with `impeccable`.** Every artifact `ui-ux-pro-max` produces is then passed through the **`impeccable`** skill as an audit pass — checking visual hierarchy, accessibility (touch targets, contrast, screen-reader labels for ± / remove), responsive behavior, empty/error states, theme-token compliance (no raw hex/px; `check-raw-tokens.mjs` must stay green), light+dark parity, and anti-patterns. `impeccable`'s findings are resolved before the component is considered done.

**Order is fixed: `ui-ux-pro-max` (produce) → `impeccable` (audit) → implement the audited design.** This applies to all three new/extended UI components and the screen composition. Log both skill invocations per UI step in the EXECUTE phase report.

---

## UI Reuse Map (research-verified — reuse before building)

**Direct-fit existing `@jojopotato/ui` components (use as-is):**
- `<CartItem>` — line row + built-in ± stepper (needs `onRemove` added, see Gaps)
- `<BranchCard>` — branch header ("Pickup from X", open/closed pill)
- `<PickupTimeBadge>` — estimated pickup time
- `<CouponCard>` (+ `<Input>`) — applied-coupon display + code entry
- `<Card>` — themed surface for grouping sections / totals wrapper
- `<Button>` (`primary`/`accent`/`ink`/`outline`) — Checkout / Apply / Clear CTAs
- `<Badge>` — item-count / promo labels

Reference: `apps/mobile/src/app/component-showcase.tsx` exercises every component with realistic typed sample data — canonical prop-usage example.

**UI Gaps — 3 new/extended components (build in `packages/ui`, via the UI/UX Workflow):**
1. **`<CartItem onRemove?>`** — extend the existing component with an `onRemove?: () => void` prop rendering a trash affordance (`Ionicons`, already used in `BranchCard`). Extending beats a screen-level wrapper (consistency). Keep the tested behavior in `cart-item.test.tsx` green.
2. **`<CartSummary>`** — new: label-value rows for subtotal / discount / total + the reward slot. Composed from `<Card>` + `TypeScale` tokens, `mode` prop convention. No such totals/label-value component exists today.
3. **`<EmptyState>`** — new: icon/illustration slot + title + optional CTA `<Button>`, theme-token-driven. No empty-state component exists in the package (`<ComingSoon>` is a route placeholder, not this).

All three trace design tokens to `process/general-plans/active/jojopotato-design-system_08-07-26/` (cited in `theme.ts`).

---

## Public Contracts

### `packages/types/src/cart.ts` — extended (backward-compatible where possible)
```ts
export interface CartItemOption {
  optionType: 'size' | 'flavor' | 'add_on';   // mirrors product_options.option_type
  id: string;                                   // product_options.id
  name: string;
  priceDeltaCents: number;                      // product_options.price_delta (cents convention)
}

export interface CartItem {
  lineId: string;                 // NEW — unique per line (same menuItem w/ different options = distinct lines)
  menuItemId: string;             // existing
  quantity: number;               // existing
  productNameSnapshot: string;    // NEW — mirrors order_items.product_name_snapshot
  unitPriceCents: number;         // NEW — snapshot: base + Σ option deltas (order_items.unit_price)
  selectedOptions: CartItemOption[]; // NEW — originates the order_items.selected_options shape
  notes?: string;                 // existing
}

export type AppliedDiscount =      // NEW — one active discount (D1), coupon-shaped (D2)
  { source: 'coupon' | 'deal' | 'reward'; refId: string; label: string; amountCents: number };

export interface Cart {
  id: string;                     // existing
  items: CartItem[];              // existing
  pickupBranchId: string;         // existing — single-branch scoping (A7)
  appliedDiscount?: AppliedDiscount; // NEW
}
```
⚠ Extending these types touches existing consumers: `packages/ui/src/components/cart-item.tsx`, `apps/mobile/src/app/component-showcase.tsx`, and `packages/ui/src/components/__tests__/mocks.ts`. Keep them compiling — the UI `CartItem` component itself already takes `product`/`flavor`/`size` as separate props (so its own prop surface is additive), **but** the `CartItem` *type*'s new fields (`lineId`, `productNameSnapshot`, `unitPriceCents`, `selectedOptions`) are **required, not optional** — see the VALIDATE finding under §Touchpoints for the two fixture literals (`MOCK_CART_ITEM`, `SAMPLE_CART_ITEM`) that will fail to typecheck unless updated in step 2 of the Implementation Checklist.

### `apps/mobile/src/features/cart/hooks/use-cart.ts` — new state seam (mirrors `use-auth.ts`)
```ts
export interface CartSessionState {
  cart: Cart;
  subtotalCents: number;         // derived (useMemo)
  discountTotalCents: number;    // derived
  totalCents: number;            // derived: subtotal - discount
  itemCount: number;             // derived
  addItem: (menuItem: MenuItem, opts: CartItemOption[], qty?: number) => void; // enforces single-branch (A7/D4)
  updateQuantity: (lineId: string, qty: number) => void;  // qty<=0 → removeItem (D-note)
  removeItem: (lineId: string) => void;
  applyDiscount: (d: AppliedDiscount) => void;
  clearDiscount: () => void;
  clearCart: () => void;
  setBranch: (branchId: string) => void;
}
export function CartSessionProvider({ children }): JSX.Element
export function useCart(): CartSessionState   // throws outside provider
```
Doc-comment must state (like auth's): in-memory only, no persistence yet, provider-agnostic seam; swapping to a real cart backend changes only this file's internals.

---

## Touchpoints

| Path | Action | Notes |
|---|---|---|
| `apps/mobile/src/app/(tabs)/order/cart.tsx` | **edit** | Replace `<ComingSoon>` body with the real screen (composed via UI/UX Workflow) |
| `apps/mobile/src/features/cart/hooks/use-cart.ts` | **new** | `CartSessionProvider` + `useCart()` (mirror `use-auth.ts` — corrected 10-07-26; `use-auth-session.ts` no longer exists) |
| `apps/mobile/src/features/cart/mock-cart.ts` | **new (opt)** | Seed lines for dev/testing; may reuse `MOCK_PRODUCTS` from `features/home/mock-home.ts` |
| `apps/mobile/src/app/_layout.tsx` | **edit** | Mount `CartSessionProvider` inside `AuthProvider` (A3 — corrected 10-07-26; real provider is `AuthProvider`, not `AuthSessionProvider`) |
| `packages/types/src/cart.ts` | **edit** | Extend `CartItem`/`Cart` + add `CartItemOption`/`AppliedDiscount` (Public Contracts) |
| `packages/ui/src/components/cart-item.tsx` | **edit** | Add `onRemove?` prop (Gap 1) |
| `packages/ui/src/components/cart-summary.tsx` | **new** | Gap 2 |
| `packages/ui/src/components/empty-state.tsx` | **new** | Gap 3 |
| `packages/ui/src/index.ts` | **edit** | Export `CartSummary`, `EmptyState` |
| `packages/ui/src/components/__tests__/cart-item.test.tsx` | **edit** | Cover `onRemove` |
| `packages/ui/src/components/__tests__/mocks.ts` | **edit** | **(VALIDATE finding, 10-07-26)** Add the 4 new required `CartItem` fields to `MOCK_CART_ITEM` (currently only `menuItemId`/`quantity`) — else T1 (typecheck) and T3 (jest, which imports this fixture) both fail |
| `apps/mobile/src/app/component-showcase.tsx` | **edit** | **(VALIDATE finding, 10-07-26)** Add the 4 new required `CartItem` fields to `SAMPLE_CART_ITEM` (currently only `menuItemId`/`quantity`) — this file already imports the `CartItem` type (confirmed via source read) and is a real compile-time consumer; else T1 fails |

---

## Blast Radius

- **Direct:** `apps/mobile` cart screen + new `features/cart/`; root `_layout.tsx` (provider mount); `packages/types/src/cart.ts`; `packages/ui` (3 components + index + test + `mocks.ts` fixture).
- **Indirect (compile-time):** any current consumer of `Cart`/`CartItem` types — verified to be `packages/ui/cart-item.tsx`, `packages/ui/src/components/__tests__/mocks.ts`, and `component-showcase.tsx`; all three must stay green (the latter two require literal updates — see Touchpoints). No runtime consumers of the cart types exist yet.
- **Risk class:** low-moderate. No auth/billing/schema/migration/API surface touched (backend untouched). The one cross-package ripple is the `packages/types` extension → `packages/ui`/`apps/mobile` recompile, now fully enumerated in Touchpoints. No import cycles exist in the repo (graph report) and this adds none.
- **Explicitly NOT touched:** `packages/api` (backend), navigation structure, payment, checkout, real network/data layer.

---

## Implementation Checklist (EXECUTE order)

> Every UI sub-step runs the **UI/UX Workflow**: `ui-ux-pro-max` (design) → `impeccable` (audit) → implement.

1. ~~Confirm remaining Decisions Required with PM~~ — **DONE (10-07-26):** D1–D9 all accepted as documented defaults (see §Decisions Required). No PM round-trip blocks EXECUTE.
2. **Types:** extend `packages/types/src/cart.ts` per Public Contracts. Typecheck `packages/types`. **Then update the 2 existing fixture literals that will otherwise fail to typecheck** (VALIDATE finding, 10-07-26): `MOCK_CART_ITEM` in `packages/ui/src/components/__tests__/mocks.ts` and `SAMPLE_CART_ITEM` in `apps/mobile/src/app/component-showcase.tsx` — add `lineId`, `productNameSnapshot`, `unitPriceCents`, `selectedOptions`. Confirm both files typecheck and the showcase route still renders.
3. **State seam:** create `apps/mobile/src/features/cart/hooks/use-cart.ts` mirroring **`use-auth.ts`** (see A1 correction) — in-memory Context, `useMemo`-derived totals, single-branch enforcement (A7/D4), qty→0 removal.
4. **Mount** `CartSessionProvider` in `apps/mobile/src/app/_layout.tsx`, inside `AuthProvider` and wrapping `RootNavigator` (see A3 correction — exact target is `AuthProvider`, not `AuthSessionProvider`).
5. **UI Gap 1 — `<CartItem onRemove?>`:** [UI/UX Workflow] extend component; update `cart-item.test.tsx`.
6. **UI Gap 2 — `<CartSummary>`:** [UI/UX Workflow] new component; export from `packages/ui/src/index.ts`.
7. **UI Gap 3 — `<EmptyState>`:** [UI/UX Workflow] new component; export.
8. **Screen:** [UI/UX Workflow] replace `cart.tsx` body — `<BranchCard>` header, `<CartItem>` list from `useCart().cart.items`, `<PickupTimeBadge>` (D5), coupon/reward slot (`<CouponCard>`+`<Input>`), `<CartSummary>`, `<EmptyState>` when empty, Checkout `<Button>` (disabled when empty, D7), mixed-branch confirm dialog (D4).
9. **Wire interactions:** stepper → `updateQuantity`; remove → `removeItem`; apply/clear discount → `applyDiscount`/`clearDiscount`; all totals recompute reactively.
10. **Verification:** run §Verification Evidence gates.
11. **Dev-nav-link tech debt** (`order/index.tsx` ungated `Dev: View Cart`) is pre-existing and **out of scope** — do not fix here (tracked in `backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md`).

---

## Phase Completion Rules
- A step is complete only when its typecheck/lint pass and (for UI steps) the `impeccable` audit findings are resolved and `check-raw-tokens.mjs` is green.
- The screen step is complete only when all Acceptance Criteria below are demonstrably met against mock data.
- (Historical gating note, now satisfied: EXECUTE could not begin until the §Dependencies & Hold condition cleared **and** D1–D9 were answered — both are done as of 10-07-26.)

---

## Acceptance Criteria (from CART-001 #17 — must all pass)
1. Increasing quantity on a line updates that line's price and the cart total correctly.
2. Decreasing quantity to zero removes the line item.
3. Removing the only item shows the empty-cart state.
4. `total == subtotal − discount`, verified **with and without** an applied coupon.
5. Backgrounding + resuming (or navigating away and back) preserves cart contents. *(Tier A — validated by navigating away/back and by app-background/resume within a live session; Tier B force-quit survival is explicitly out of scope per A2/D3.)*
6. Single-branch cart: adding a product from a different branch triggers the deterministic clear-and-switch prompt (no silent mixed-branch cart).

Plus (plan-added, product-confirm): empty-state disables Checkout (D7); reactive recalc on every mutation; qty→0 == remove (D-note).

---

## Validate Contract

**generated-by:** outer-pvl
**date:** 2026-07-10
**Date:** 10-07-26
**supersedes:** 2026-07-09 (outer-pvl) — prior contract was a `Gate: PENDING` placeholder; this pass replaces it with real V1–V7 findings

### Parallel strategy
Parallel strategy: parallel-subagents
Rationale: 7-signal score 2/7 (S1 multi-package scope — apps/mobile + packages/types + packages/ui; S7 5+ blast-radius files — 12 touchpoints). No schema/auth/API/billing surface, no phase-program context, no 3+ competing directions — MEDIUM tier, not a coordination-heavy fan-out. Executed in this pass as a single validate-agent performing the full Layer 1 (4 dimensions) + Layer 2 (per-section) checklist directly (no Task/Agent tool available in this session) — findings backed by direct source reads and grep, matching parallel-subagent-equivalent depth (see Dimension findings below for evidence per check).

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| T1 | Typecheck clean across `packages/types`, `packages/ui`, `apps/mobile` after the cart type extension + component changes (incl. the 2 fixture literal updates) | Fully-Automated | `pnpm typecheck` (turbo; or scoped: `pnpm --filter @jojopotato/types --filter @jojopotato/ui --filter @jojopotato/mobile typecheck`) | A |
| T2 | No raw hex/px in new/edited UI components; lint clean | Fully-Automated | `pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs` | A |
| T3 | `<CartItem onRemove?>`, `<CartSummary>`, `<EmptyState>` render without throwing (jest-expo — confirmed present, not conditional; corrects the plan's original "if jest-expo is present" hedge) | Fully-Automated | `pnpm --filter @jojopotato/ui test` | A |
| T4 | AC1–AC6 (qty math, qty→0 remove, empty state, `total == subtotal − discount` with/without coupon, background/resume persistence, mixed-branch prompt) behave correctly against mock data | Agent-Probe | Manual/agent-driven walkthrough of the cart screen for each AC scenario (empty, one-item, many-items, discount-applied, background/resume, mixed-branch prompt); screenshot/recording evidence captured per §Verification Evidence | A |
| T5 | Typed-routes codegen unaffected (no new dynamic route added — cart route already registered) | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` (no `expo start` codegen re-run needed — no new route file) | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: `strategy:` carries only Fully-Automated / Hybrid / Agent-Probe. Known-Gap is never a strategy value.

**Failing stub — T1:**
```
test("should typecheck cleanly across packages/types, packages/ui, apps/mobile after cart extension", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm typecheck`, expect exit 0")
})
```
**Failing stub — T2:**
```
test("should have zero raw hex/px in new cart UI components and pass lint", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs`, expect exit 0")
})
```
**Failing stub — T3:**
```
test("should render CartItem with onRemove without throwing", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: CartItem onRemove renders a trash affordance")
})
test("should render CartSummary and EmptyState without throwing", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: new components render against mock data")
})
```
**Failing stub — T5:**
```
test("should leave typed-routes codegen unaffected by the cart screen edit", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: run `pnpm --filter @jojopotato/mobile typecheck`, expect exit 0")
})
```
(T4 is Agent-Probe — no stub per policy.)

**Legacy line form:**
- Types/lint/tokens (T1/T2): Fully-automated: `pnpm typecheck && pnpm lint && node packages/ui/scripts/check-raw-tokens.mjs`
- Component render tests (T3): Fully-automated: `pnpm --filter @jojopotato/ui test` (jest-expo — confirmed present in `packages/ui/package.json`, not conditional)
- Screen behavior (T4): Agent-probe: manual/agent walkthrough of AC1–6 against mock data, evidence captured
- Typed routes (T5): Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` (no new route; codegen unaffected)

### Dimension findings
- Infra fit: CONCERN → **RESOLVED in this pass** — plan's A1/A3/Touchpoints originally instructed EXECUTE to mirror `use-auth-session.ts` and mount inside `AuthSessionProvider`; both no longer exist. Verified via direct read of `apps/mobile/src/app/_layout.tsx` and `apps/mobile/src/features/auth/hooks/`: current seam is `use-auth.ts` (`AuthProvider`/`useAuth()`). Corrected in A1, A3, and the Touchpoints table.
- Test coverage: CONCERN → **RESOLVED in this pass** — plan hedged T3 as a conditional known-gap ("if jest-expo is present"); `packages/ui/package.json` confirms jest-expo IS configured (`"test": "jest"`, `jest.config.js` present, 12 existing `__tests__/*.test.tsx` files including `cart-item.test.tsx`). T3 is Fully-Automated, not known-gap.
- Breaking changes: CONCERN → **RESOLVED in this pass** — the `CartItem` type's 4 new fields are required, not optional. Grep + direct read found 2 existing literals that will fail to typecheck once the extension lands: `MOCK_CART_ITEM` (`packages/ui/src/components/__tests__/mocks.ts:59-62`) and `SAMPLE_CART_ITEM` (`apps/mobile/src/app/component-showcase.tsx:123-126`) — neither was in the original Touchpoints table. Both added to Touchpoints and Implementation Checklist step 2. Confirmed the plan's stated blast-radius consumers (`cart-item.tsx`, `component-showcase.tsx`) were otherwise accurate — `component-showcase.tsx` does import the `CartItem` type (multi-line import, verified by source read).
- Security surface: PASS — no auth/billing/schema/secrets/trust-boundary surface touched; cart state is client-local only until CART-002's backend integration; `packages/api` is untouched.

### Section-level (Layer 2) findings
- Architecture Decisions (A1–A7): CONCERN → RESOLVED — see Infra fit above.
- Public Contracts & Touchpoints: CONCERN → RESOLVED — see Breaking changes above.
- Implementation Checklist: PASS — steps are correctly sequenced once the corrections above are applied (types → fixtures → state seam → mount → UI gaps → screen → wiring → verification); step 1 (D1–D9 confirm) is now satisfied.
- Dependencies & Hold: CONCERN → RESOLVED — plan's Status line and §Dependencies & Hold still described "EXECUTE ON HOLD"; session decision + `git log` (`85ee923 Merge branch 'feat/auth'...`) confirm the hold is cleared. Corrected in the Status line and §Dependencies & Hold.

### Open gaps
None unresolved — all 4 CONCERNs found during this VALIDATE pass were fixed directly in the plan text (see Dimension/Section findings above). Pre-existing accepted known-gaps carried forward unchanged from the plan (none are "developed behavior with zero gate" — each has at least Agent-Probe/hybrid coverage or an explicit out-of-scope rationale, so the net-gate vacuous-green ban does not apply):
- No project-wide E2E/regression harness exists (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — AC5/AC6 (persistence, mixed-branch prompt) are proven via T4 agent-probe in this plan, not by an automated regression suite.
- Tier B (force-quit) persistence is explicitly out of scope by lead-dev decision (no AsyncStorage) — not a gap, a scoped exclusion (A2/D3).
- Real discount/reward pricing-engine math is stubbed behind `AppliedDiscount`, deferred to CART-002 by design.

### What this coverage does NOT prove
- T1/T2 (typecheck/lint/tokens) do not prove runtime correctness of cart math or UI behavior — only that types compile and lint/token rules are satisfied.
- T3 (jest render tests) prove the 3 new/extended components render without throwing for the specific fixtures exercised — they do not prove pixel-perfect layout, animation, or every prop combination.
- T4 (agent-probe of AC1–6) proves the 6 acceptance criteria behave correctly against mock data in one manual/agent-driven pass — it does not prove behavior under real backend data, concurrent multi-device carts, or app force-quit persistence (explicitly out of scope per A2/D3).
- T5 proves no route-codegen regression — it does not exercise actual runtime navigation to/from cart beyond what T4 already covers.
- None of these gates prove backend integration correctness — `packages/api` is untouched and has no cart consumer yet; that is explicitly out of scope for CART-001 (CART-002 territory).

**Gate: PASS**

---

## Autonomous Goal Block

SESSION GOAL: Ship the Cart screen (CART-001) — real cart state seam + screen replacing the `ComingSoon` placeholder, backed by `@jojopotato/ui` components, no backend/checkout work.
Charter + umbrella plan: N/A — single plan (`process/features/ordering-cart/active/cart-screen_09-07-26/cart-screen_PLAN_09-07-26.md`)
Autonomy: Standard RIPER-5 autonomy — EXECUTE requires explicit "ENTER EXECUTE MODE"; PVL/EVL supplement-fix loops (if any) run autonomously per `process/development-protocols/orchestration.md` §PVL/EVL Loop Routing; blocked items go to backlog and execution continues on remaining checklist items.
Hard stop conditions / safety constraints:
- No backend/checkout/payment work — `packages/api` stays untouched (out of scope per plan).
- No new runtime dependency (state library, storage library) — A1/A2 lock React Context + in-memory only, no AsyncStorage.
- Every UI step MUST go through `ui-ux-pro-max` → `impeccable` before implementation, constrained to existing `theme.ts` tokens only — no new hexes/px; `check-raw-tokens.mjs` must stay green.
- Do not touch `apps/mobile/src/app/(tabs)/order/_layout.tsx` or navigation structure — the cart route/`Stack.Screen` is already registered.
- Mount target is `AuthProvider` (from `use-auth.ts`) — do not reintroduce `AuthSessionProvider`/`use-auth-session.ts`, which no longer exist.
Next phase: EXECUTE — `process/features/ordering-cart/active/cart-screen_09-07-26/cart-screen_PLAN_09-07-26.md` (Implementation Checklist steps 1–11)
Validate contract: inline in plan (`## Validate Contract` section, this file) — Gate: PASS, 10-07-26
Execute start: `pnpm typecheck && pnpm lint` (fully-auto baseline) | T4 agent-probe walkthrough of AC1–6 | high-risk pack: no

---

## Verification Evidence (to capture during EXECUTE — see `process/context/tests/all-tests.md` for runner selection)
- Typecheck output (T1) for all three packages, including the 2 corrected fixture files.
- `check-raw-tokens.mjs` output (T2).
- `pnpm --filter @jojopotato/ui test` output (T3).
- Screenshots/recording of the 6 AC scenarios (T4) — empty, one-item, many-items, discount-applied, background/resume, mixed-branch prompt — captured via the UI/UX Workflow + `verify`/`run` skill.
- Both `ui-ux-pro-max` and `impeccable` invocations logged per UI step.

---

## Dependencies & Hold

**HOLD: CLEARED (10-07-26).** The auth system has landed on this branch — `85ee923 Merge branch 'feat/auth' of https://github.com/potakaaa/jojo-mobile into feat/cart-screen` (confirmed via `git log`), and `apps/mobile/src/features/auth/hooks/use-auth.ts` (`AuthProvider`/`useAuth()`) is live (confirmed via direct file read). CART-001 never had a hard *technical* dependency on auth (the cart screen renders without a signed-in user) — the hold was a team sequencing decision, now lifted. This plan is EXECUTE-ready.

**Soft dependencies (forward-compat only, do not block):**
- Provider nesting assumes auth exists above cart (A3, corrected target: `AuthProvider`) — already true.
- Reward redemption (D2) will eventually read the user's issued `coupons` — stubbed until backend + auth integration.

**Backend-integration debt (future ticket, NOT CART-001):** `packages/types`↔schema mismatches — cents vs `numeric(10,2)`; `OrderStatus` enum (`confirmed`/`ready_for_pickup` vs schema `accepted`/`ready`/`flavoring`); coupon-model shape; `PickupBranch.isOpen` collapsing `is_active`+`is_accepting_pickup`. Track when checkout (CART-002) wires the real backend.

---

## Resume and Execution Handoff
- **State:** planning complete; VALIDATE complete (Gate: PASS, 10-07-26); hold cleared; D1–D9 accepted. No code written yet.
- **Next action:** run the Implementation Checklist top-to-bottom via `vc-execute-agent`, with every UI step going through the UI/UX Workflow (`ui-ux-pro-max` → `impeccable`). Apply the VALIDATE corrections as written into the plan (auth-seam target, the 2 fixture-literal updates, T3's corrected tier) — no separate action needed, they are now part of the checklist/touchpoints.
- **Plan file:** `process/features/ordering-cart/active/cart-screen_09-07-26/cart-screen_PLAN_09-07-26.md`.
- **Sibling issue:** CART-002 (#18, checkout) depends on this cart state; design of `AppliedDiscount` + `unitPriceCents`/`selectedOptions` snapshots is deliberately checkout-forward-compatible.
- **Do NOT** start EXECUTE without explicit "ENTER EXECUTE MODE" (hold and D1–D9 are no longer blockers).
