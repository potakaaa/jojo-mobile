# Cart Screen (CART-001) — Implementation Plan

**Feature:** ordering-cart
**Issue:** [CART-001] [P0] Cart screen with items, quantities, totals, and coupon slot (#17)
**Milestone:** Phase 1: Customer App Core
**Date**: 2026-07-09
**Status**: Planning complete — EXECUTE ON HOLD (team decision: no coding until the auth system lands; see §Dependencies & Hold)
**Complexity**: COMPLEX (new state seam + 3 new shared components + domain-type extensions + data-model decisions with backend-alignment implications)
**Context**: see `process/context/all-context.md` (repo router)
**Author:** orchestrator (synthesized from 6 parallel research agents, 2026-07-09)

---

## Overview (Context and Goals)

### Goal
Deliver the Cart screen exactly as CART-001 specifies: selected branch, line items (name, size/flavor/options, quantity, line price), subtotal, discount, total, estimated pickup time, applied coupon/deal, reward-redemption slot; with per-line quantity +/−, qty→0 removal, individual remove, reactive recalculation, persistence across backgrounding, and a deterministic single-branch cart rule.

### Current reality (research-verified)
- **The Cart route already exists as a placeholder.** `apps/mobile/src/app/(tabs)/order/cart.tsx` is a `<ComingSoon title="Cart" isNestedScreen>` with a dev link to Checkout. Its `Stack.Screen name="cart"` is already registered in `apps/mobile/src/app/(tabs)/order/_layout.tsx` with `title: 'Cart'`. **CART-001 replaces the placeholder body — it adds no navigation.**
- **No cart state exists anywhere.** No `use-cart`, `CartProvider`, or `features/cart/` folder. Greenfield at the screen + state level.
- **No state library and no storage dependency are installed** (grep across every `package.json`: zero matches for zustand/redux/jotai/valtio/tanstack/async-storage/secure-store/sqlite/mmkv). The only state-seam precedent is `apps/mobile/src/features/auth/hooks/use-auth-session.ts` — a plain in-memory React Context.
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
2. **Mobile structure:** cart route + Stack already exist; mirror `use-auth-session.ts`; mount provider in root `_layout.tsx`; new `features/cart/` folder.
3. **Types (`packages/types/src/cart.ts`):** `CartItem { menuItemId, quantity, notes? }` and `Cart { id, items, pickupBranchId }` are skeletons — every other required field is absent but composable from existing sibling types (`Flavor`, `Size`, `Coupon`, `Deal`, `PickupTime`, `PickupBranch`).
4. **UI:** 8 direct-fit components; 3 gaps (remove affordance, `CartSummary`, `EmptyState`); strict theme-token conventions (`mode` prop, no raw hex/px — enforced by `packages/ui/scripts/check-raw-tokens.mjs`).
5. **DB schema (`packages/api`):** pricing = `base_price + Σ(option price_delta)`, snapshotted into `order_items` at order time; discounts only aggregate at `orders.discount_total`; availability is per-product-per-branch only; `order_items.selected_options` jsonb has **no defined shape** anywhere. Several `packages/types`↔schema mismatches exist (cents vs decimal, `order_status` enum values, coupon model) — noted as future-integration debt, non-blocking for CART-001.
6. **State/persistence:** in-memory Context satisfies the literal acceptance criterion; no new dependency needed. Storage-backed (app-kill) persistence is **ruled out by the lead dev (no AsyncStorage, 2026-07-09)** — force-quit clears the cart by design.

---

## Architecture Decisions (LOCKED — research-backed)

### A1. State container: React Context, mirroring `use-auth-session.ts` — no new dependency
`CartSessionProvider` + `useCart()` using only `useState`/`useContext`/`useMemo` (already installed via `react`). Rationale: repo has zero state-management deps and the sole state-seam convention is auth's in-memory Context; Context's re-render granularity is a non-issue at cart scale; adding Zustand for one provider violates the documented "minimal deps" ethos (`all-context.md`) and YAGNI. Backed by state/persistence research (grep: zero state-lib matches) and `use-auth-session.ts` precedent.

### A2. Persistence: in-memory only for CART-001 (LOCKED by lead dev — no AsyncStorage)
The acceptance criterion — *"not lost if the user leaves and returns before checkout"* — is **Tier A** (app backgrounded/navigated-away, JS process alive). In-memory Context state held **above the navigator** satisfies this for free, exactly as `hasOnboarded` already survives backgrounding in auth. **Tier B** (survive app force-quit/relaunch) needs AsyncStorage and is explicitly **out of scope**: the lead dev has ruled **no AsyncStorage** (2026-07-09). No storage dependency is added; force-quit clears the cart by design. This closes D3 — no follow-up storage work, no backlog note.

### A3. Mount point & provider order
`CartSessionProvider` wraps `<RootNavigator />` in `apps/mobile/src/app/_layout.tsx`, nested **inside** `AuthSessionProvider` (cart is conceptually per-user; nesting lets a future version read auth without re-parenting). Current auth state has no such dependency, so this is a forward-compatible choice, not a hard requirement.

### A4. Screen implementation: replace the placeholder body
Edit `apps/mobile/src/app/(tabs)/order/cart.tsx` in place. Keep the `isNestedScreen` safe-area behavior (framed by the native Stack header, not the floating tab bar). No `_layout.tsx` / Stack changes.

### A5. Data model: mobile-local cents convention, aligned to `order_items` shape
Keep the app's existing **integer `priceCents`** convention (used by `MenuItem`, `formatCurrency`) rather than the DB's `numeric(10,2)` decimal-string — reconciling units is a future backend-integration ticket, not CART-001. The extended cart line item mirrors `order_items` field-for-field so checkout write-through needs no renaming (see §Public Contracts). The `selectedOptions` shape is **originated here** (the DB jsonb is undefined) — define it as `{ optionType: 'size'|'flavor'|'add_on'; id; name; priceDeltaCents }[]`.

### A6. Pricing: snapshot at add-to-cart
Line `unitPriceCents = product.priceCents + Σ(selectedOptions.priceDeltaCents)`, captured when the item is added (mirrors `order_items.unit_price` snapshot semantics). `lineTotalCents = unitPriceCents × quantity`. `subtotalCents = Σ lineTotalCents`. `totalCents = subtotalCents − discountTotalCents`. ⚠ Whether existing lines **live-reprice** if the catalog price changes is a PRD gap (D6) — default: snapshot (no live reprice) until checkout re-validation, matching the PRD's "product price changes before checkout" edge case being a *checkout* concern.

### A7. Single-branch cart: enforce in the provider
`Cart.pickupBranchId` already encodes single-branch scoping, and `orders.branch_id` is one-branch-per-order. `addItem` with a product from a different branch triggers a deterministic **"Clear cart and switch branch?"** confirm (block-or-clear, never a silent mixed-branch cart). Exact copy/UX is a UI-workflow output (§UI/UX Workflow). Backed by types + DB (one `branch_id` per order).

---

## Decisions Required (PRD gaps — resolve with PM before/within EXECUTE)

These are genuine PRD gaps (PRD research §5). Each has a **proposed default** so EXECUTE is not blocked, but each should be explicitly confirmed. None require code before auth lands.

| ID | Question | Proposed default (for MVP) |
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

---

## UI/UX Workflow (MANDATORY — applies to every screen/component step below)

All UI design and build work in this plan follows a two-step skill pipeline. **Do not hand-author cart UI directly.**

1. **Plan/design with `ui-ux-pro-max`.** For each cart UI surface (screen layout, `<CartSummary>`, `<EmptyState>`, the `<CartItem>` remove affordance, the branch header, the coupon/reward slot, the mixed-branch confirm dialog), invoke the **`ui-ux-pro-max`** skill to produce the design: layout, hierarchy, states (default / empty / one-item / many-items / discount-applied / branch-unavailable), spacing, motion, and component composition — expressed against the existing `@jojopotato/ui` theme tokens (`Palette`, `Colors[mode]`, `Spacing`, `Radii`, `Shadows`, `FontFamily`, `TypeScale`) and the flat "comic" offset-shadow brand signature.
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
⚠ Extending these types touches existing consumers: `packages/ui/src/components/cart-item.tsx` and `apps/mobile/src/app/component-showcase.tsx`. Keep them compiling (the UI `CartItem` already takes `product`/`flavor`/`size` as separate props, so the extension is additive).

### `apps/mobile/src/features/cart/hooks/use-cart.ts` — new state seam (mirrors `use-auth-session.ts`)
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
| `apps/mobile/src/features/cart/hooks/use-cart.ts` | **new** | `CartSessionProvider` + `useCart()` (mirror `use-auth-session.ts`) |
| `apps/mobile/src/features/cart/mock-cart.ts` | **new (opt)** | Seed lines for dev/testing; may reuse `MOCK_PRODUCTS` from `features/home/mock-home.ts` |
| `apps/mobile/src/app/_layout.tsx` | **edit** | Mount `CartSessionProvider` inside `AuthSessionProvider` (A3) |
| `packages/types/src/cart.ts` | **edit** | Extend `CartItem`/`Cart` + add `CartItemOption`/`AppliedDiscount` (Public Contracts) |
| `packages/ui/src/components/cart-item.tsx` | **edit** | Add `onRemove?` prop (Gap 1) |
| `packages/ui/src/components/cart-summary.tsx` | **new** | Gap 2 |
| `packages/ui/src/components/empty-state.tsx` | **new** | Gap 3 |
| `packages/ui/src/index.ts` | **edit** | Export `CartSummary`, `EmptyState` |
| `packages/ui/src/components/__tests__/cart-item.test.tsx` | **edit** | Cover `onRemove` |

---

## Blast Radius

- **Direct:** `apps/mobile` cart screen + new `features/cart/`; root `_layout.tsx` (provider mount); `packages/types/src/cart.ts`; `packages/ui` (3 components + index + test).
- **Indirect (compile-time):** any current consumer of `Cart`/`CartItem` types — verified to be only `packages/ui/cart-item.tsx` and `component-showcase.tsx`; both must stay green. No runtime consumers of the cart types exist yet.
- **Risk class:** low-moderate. No auth/billing/schema/migration/API surface touched (backend untouched). The one cross-package ripple is the `packages/types` extension → `packages/ui` recompile. No import cycles exist in the repo (graph report) and this adds none.
- **Explicitly NOT touched:** `packages/api` (backend), navigation structure, payment, checkout, real network/data layer.

---

## Implementation Checklist (EXECUTE order — ON HOLD until auth lands)

> Every UI sub-step runs the **UI/UX Workflow**: `ui-ux-pro-max` (design) → `impeccable` (audit) → implement.

1. **Confirm remaining Decisions Required with PM** (D3 is RESOLVED — Tier A, no AsyncStorage; still open: D1/D2 discount model + others). Record answers in this plan before code.
2. **Types:** extend `packages/types/src/cart.ts` per Public Contracts. Typecheck `packages/types`.
3. **State seam:** create `apps/mobile/src/features/cart/hooks/use-cart.ts` mirroring `use-auth-session.ts` — in-memory Context, `useMemo`-derived totals, single-branch enforcement (A7/D4), qty→0 removal.
4. **Mount** `CartSessionProvider` in `apps/mobile/src/app/_layout.tsx` (inside `AuthSessionProvider`).
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
- EXECUTE may not begin until the §Dependencies & Hold condition clears **and** D1–D9 are answered (defaults acceptable if explicitly confirmed).

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
**date:** 2026-07-09
**Gate:** PENDING (to be run by vc-validate-agent before EXECUTE)

### Test gates (no runner configured yet — see `process/context/tests/all-tests.md`)
- **T1 — Typecheck (fully-automated):** `pnpm -w turbo run typecheck` (or per-package `tsc --noEmit`) across `packages/types`, `packages/ui`, `apps/mobile` — all green after the type extension + component changes.
- **T2 — Lint / tokens (fully-automated):** ESLint clean; `node packages/ui/scripts/check-raw-tokens.mjs` green (no raw hex/px in new components).
- **T3 — Component unit test (fully-automated, if jest-expo is present in `packages/ui`):** `cart-item.test.tsx` covers `onRemove`; add render-without-throw tests for `<CartSummary>` and `<EmptyState>` (matching the existing showcase test style). If no runner is wired in the target package, mark as **known-gap** and cover via T4.
- **T4 — Manual/agent probe (hybrid):** drive the cart screen against mock data and verify AC 1–6 (qty math, qty→0 remove, empty state, total==subtotal−discount with/without coupon, background/resume persistence, mixed-branch prompt). Use the `/run` or `verify` skill once EXECUTE is unblocked.
- **T5 — Typed-routes sanity:** no new dynamic routes are added (screen already registered), so `expo start` codegen is unaffected; a `tsc` pass suffices.

### Known gaps (accepted, tracked)
- No E2E/regression harness exists project-wide (`mobile-e2e-navigation-harness_NOTE_09-07-26.md`) — AC 5/6 verified manually until then.
- Tier B (force-quit) persistence ruled out by lead dev (no AsyncStorage) — cart intentionally clears on app kill.
- Real discount/reward pricing engine stubbed behind `AppliedDiscount` (CART-002).

---

## Verification Evidence (to capture during EXECUTE)
- Typecheck output (T1) for all three packages.
- `check-raw-tokens.mjs` output (T2).
- Test output (T3) if runner present, else known-gap note.
- Screenshots/recording of the 6 AC scenarios (T4) — empty, one-item, many-items, discount-applied, background/resume, mixed-branch prompt — captured via the UI/UX Workflow + `verify`/`run` skill.
- Both `ui-ux-pro-max` and `impeccable` invocations logged per UI step.

---

## Dependencies & Hold

**HOLD:** Team decision (2026-07-09) — **no coding until the auth system (owned by teammate) lands.** CART-001 has no hard *technical* dependency on auth (the cart screen renders without a signed-in user), but the team is serializing work behind the auth foundation. This plan is EXECUTE-ready and parked in `active/`; unpark when auth is merged.

**Soft dependencies (forward-compat only, do not block):**
- Provider nesting assumes auth exists above cart (A3) — already true.
- Reward redemption (D2) will eventually read the user's issued `coupons` — stubbed until backend + auth integration.

**Backend-integration debt (future ticket, NOT CART-001):** `packages/types`↔schema mismatches — cents vs `numeric(10,2)`; `OrderStatus` enum (`confirmed`/`ready_for_pickup` vs schema `accepted`/`ready`/`flavoring`); coupon-model shape; `PickupBranch.isOpen` collapsing `is_active`+`is_accepting_pickup`. Track when checkout (CART-002) wires the real backend.

---

## Resume and Execution Handoff
- **State:** planning complete; EXECUTE on hold (auth). No code written.
- **Next action when unblocked:** answer D1–D9 with PM (defaults documented), then run the Implementation Checklist top-to-bottom via `vc-execute-agent`, with every UI step going through the UI/UX Workflow (`ui-ux-pro-max` → `impeccable`).
- **Plan file:** `process/features/ordering-cart/active/cart-screen_09-07-26/cart-screen_PLAN_09-07-26.md`.
- **Sibling issue:** CART-002 (#18, checkout) depends on this cart state; design of `AppliedDiscount` + `unitPriceCents`/`selectedOptions` snapshots is deliberately checkout-forward-compatible.
- **Do NOT** start EXECUTE without: (a) hold cleared, (b) D1–D9 confirmed, (c) explicit "ENTER EXECUTE MODE".
