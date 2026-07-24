---
name: plan:order-completion-celebration
description: "COMPLEX plan — celebratory moment + persisted review/rating prompt when a customer's order reaches completed. New reviews table + migration + route + shared type + packages/ui star-rating input + client transition-detection."
date: 22-07-26
feature: ordering-cart
---

# PLAN — Order Completion Celebration + Review Prompt

- **Date**: 22-07-26
- **Status**: ACTIVE — PLAN written, VALIDATE pending
- **Complexity**: COMPLEX
- **Feature:** ordering-cart
- **Context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`,
  `process/context/tests/all-tests.md`, plus the SPEC in this task folder.

## Overview

**Classification: COMPLEX.** New DB schema + numbered migration + new API route (accepting user
input, ownership-boundary-sensitive) + new shared type + new `packages/ui` interactive component +
new client transition-detection logic, spanning 3 packages (`packages/api`, `packages/types`,
`packages/ui`) + `apps/mobile`. Greenfield: no review/rating system exists in the codebase today.
This plan follows the SPEC at
`process/features/ordering-cart/active/order-completion-celebration_22-07-26/order-completion-celebration_SPEC_22-07-26.md`
and the D1-D8 decisions locked with the user this session. Repository context router:
`process/context/all-context.md`.

**TL;DR:** Add a `reviews` table (one row per completed order) with a session-gated, ownership-checked
`POST /orders/:orderId/review` route mirroring `PATCH /orders/:orderId/complete`; a new
`packages/ui` `StarRatingInput` (tap-to-rate 1-5, required `mode` prop); a pure
`shouldCelebrate(prev,next)` predicate + a `useCompletionCelebration` hook that fires the celebration
on BOTH the self-confirm `onSuccess` path AND a live-poll `ready→completed` diff, never on a stale
already-completed mount; and a reanimated-only celebration + review-prompt overlay wired into the
tracking screen. VALIDATE required before EXECUTE. Flagged HIGH-RISK (new UGC surface + ownership
boundary) → VALIDATE should consider the 5-artifact risk evidence pack.

---

## Locked Decisions (resolved directly with the user this session — do NOT re-derive)

| ID | Decision | Consequence for this plan |
|---|---|---|
| **D1** | Rate the **order overall** — single rating + optional comment per completed order. | One `reviews` row per order; one rating widget + one comment field. Not per-branch, not per-product. |
| **D2** | **PERSIST IT.** New `reviews` table, migration, route, shared type. | Full backend slice; UI is not throwaway. |
| **D3** | Handle **BOTH** trigger paths: (a) self-confirm via `useCompleteOrder().onSuccess`, and (b) live-poll `ready→completed` diff detected while the tracking screen is mounted. | New client prev-status detection. Must not false-fire on stale mount (AC2). |
| **D4** | **Stars (1-5) tap-to-rate** input. Build new in `packages/ui` (none exists). | New `StarRatingInput` component, required `mode: ThemeMode` prop (no default). |
| **D5** | Optional **short comment** text field included. | `reviews.comment` nullable; UI has an optional text input. |
| **D6** | Celebration renders **only in the live tracking-screen session** where the transition is directly observed. No "next app open" / Order-History resurfacing. | No new global/background surfacing. Missing the moment = normal completed state, no celebration. This is acceptable, **not** a gap. |
| **D7** | Celebration visual built from **reanimated (v4.5.0) only** — NO new dependency (no confetti/lottie added to `package.json`). | Follow the `LiveBadge` reanimated pattern already in `tracking/index.tsx`. |
| **D8** | **NO edit-after-submit** (locked default, matches SPEC Out-Of-Scope). | Route rejects a second review for the same order; UI shows submitted state, no edit path. This is a locked scope boundary, **not** a gap. |

---

## Goals

- A distinct, reanimated-only celebratory moment fires on the tracking screen the instant an order
  reaches `completed`, on both the self-confirm and staff-completed-live paths, exactly once per
  device session, never on a stale mount.
- A dismissible star-rating (1-5) + optional comment prompt appears alongside the celebration.
- The rating persists to a new `reviews` table via a session-gated, ownership-checked route.
- Zero change to push/notification surfaces (`OrderNotificationEvent` stays frozen — AC4).

## Scope

In scope: the `reviews` table + migration; `POST /orders/:orderId/review`; `packages/types` review
types + boundary serializer; `packages/ui` `StarRatingInput`; mobile api-client fn + submit hook +
pure celebration predicate + detection hook + celebration/review overlay; wiring into
`tracking/index.tsx`.

Out of scope (per SPEC + D6/D8): reviews backend product (moderation, public display, admin UI,
aggregate ratings), push for completion, staff UI, retroactive celebration, review incentives,
edit/delete-after-submit, Order-History / next-app-open resurfacing.

---

## Touchpoints

### `packages/api`
- **NEW** `packages/api/src/db/schema/reviews.ts` — the `reviews` table. Follow the `carts.ts`
  house style (imports of `users`/`orders`, `uuid().primaryKey().defaultRandom()`,
  `timestamp('created_at').defaultNow().notNull()`).
- **EDIT** `packages/api/src/db/schema/index.ts` — add `export * from './reviews';` in FK-dependency
  order (after `orders` — position ~"9b", depends on `users` + `orders`).
- **NEW** `packages/api/drizzle/0020_<generated>.sql` + its `meta/` snapshot — generated via
  `pnpm --filter @jojopotato/api db:generate` (latest is `0019`, so this is `0020`). Do NOT
  hand-number; let drizzle-kit generate, then verify journal contiguity.
- **EDIT** `packages/api/src/routes/orders.ts` — add `POST /:orderId/review`, registered near the
  other `/:orderId/*` routes. Mirror the `PATCH /:orderId/complete` ownership pattern **verbatim**
  (malformed id → 404; load order; **ownership check BEFORE any state gate** → 403; then business
  gates). Uses `requireSession`.
- **EDIT** `packages/api/src/routes/lib/serializers.ts` — add `ApiReview` + `serializeReview`
  (local-declaration convention, matching `ApiOrder`/`ApiBranch`). Rating is an integer, not money —
  no cents conversion; `created_at` → ISO string.

### `packages/types`
- **NEW** `packages/types/src/review.ts` — `Review` (client shape), `SubmitReviewRequest`
  (`{ rating: number; comment?: string }`), `SubmitReviewResponse` (`{ review: Review }`).
- **EDIT** `packages/types/src/index.ts` — add `export * from './review';`.

### `packages/ui`
- **NEW** `packages/ui/src/components/star-rating-input.tsx` — `StarRatingInput`: controlled
  `value: number` (0 = none) / `onChange: (rating: number) => void`, `max = 5`, **required
  `mode: ThemeMode` (no default)**, `testID` passthrough. Tap star N sets value N. Theme tokens
  from `theme.ts` (`Colors[mode]`), no hardcoded colors. Follow `badge.tsx`/`star-progress-bar.tsx`
  file shape.
- **EDIT** `packages/ui/src/index.ts` — add `export * from './components/star-rating-input';`.
- **NEW** `packages/ui/src/components/__tests__/star-rating-input.test.tsx` — jest-expo component test.

### `apps/mobile`
- **NEW** `apps/mobile/src/features/orders/lib/celebration-trigger.ts` — PURE
  `shouldCelebrate(prevStatus: OrderStatus | undefined, nextStatus: OrderStatus): boolean`. Fires
  only when `prevStatus` is defined AND non-terminal AND `nextStatus === 'completed'`. Returns
  `false` when `prevStatus` is `undefined` (first render / stale already-completed mount → AC2).
- **NEW** `apps/mobile/src/features/orders/hooks/use-completion-celebration.ts` — holds a
  previous-status ref, calls `shouldCelebrate` on status change, exposes
  `{ celebrationVisible, showCelebration, dismissCelebration }`. `showCelebration` is also callable
  directly from `useCompleteOrder().onSuccess` (self-confirm path). Guards against double-fire (once
  shown for an order id in this session, will not re-show).
- **EDIT (new export)** `apps/mobile/src/features/orders/lib/api-client.ts` — add
  `submitReview(orderId, body)` (rides the session-carrying `apiRequest()` wrapper, same as
  `completeOrder`). Added to the existing file, not a new file.
- **NEW** `apps/mobile/src/features/orders/hooks/use-submit-review.ts` — `useSubmitReview()`
  mutation, invalidates nothing critical (review is write-only from the client's view; optionally
  invalidate `['order', orderId]` if the serializer starts returning review state).
- **NEW** `apps/mobile/src/features/orders/components/order-celebration-overlay.tsx` — screen-local
  reanimated celebration visual (entering animation, "You're all set!" message) + the review prompt
  (embeds `StarRatingInput` + optional comment `Input` + Submit + Skip). Modal-based, dismissible
  (mirrors `ConfirmDialog` structure). Built reanimated-only (D7). **NOTE jest gap:** the shared
  reanimated mock lacks layout-animation exports (`FadeIn`/`FadeOut`/etc.) — see Test Infra
  Improvement Notes; the overlay must use `useAnimatedStyle`/`useSharedValue`/`withTiming` (covered
  by the mock, per the `LiveBadge` pattern) rather than entering/exiting layout animations, OR the
  mock must be extended first.
- **EDIT** `apps/mobile/src/app/(tabs)/tracking/index.tsx` — wire `useCompletionCelebration`, call
  `showCelebration` from the completion `onSuccess`, render `OrderCelebrationOverlay` gated on
  `celebrationVisible`. Do NOT touch the `useOrderQuery` poll contract (LIVE-001 E4 hard contract)
  or the existing `ConfirmDialog`/`ready`-gate logic.

---

## Public Contracts

- **New DB table `reviews`** (proposed columns):
  - `id uuid pk default random`
  - `order_id uuid NOT NULL references orders.id` — **UNIQUE** (one review per order → enforces D1 +
    D8 at the DB level: a duplicate insert violates the unique constraint → 409).
  - `user_id uuid NOT NULL references users.id`
  - `rating integer NOT NULL` (validated 1-5 at the Zod boundary; optionally a DB `CHECK 1..5`)
  - `comment text` (nullable — D5)
  - `created_at timestamp default now() NOT NULL`
- **New route `POST /orders/:orderId/review`** (session-gated):
  - Request: `{ rating: number (int 1-5), comment?: string (trimmed, bounded length) }`
  - `200 { review: ApiReview }` on success
  - `403` — order not owned by caller (ownership checked BEFORE state gate)
  - `404` — malformed id or order not found
  - `409` — order is not `completed` (can only review a completed order) **and/or** a review already
    exists for this order (unique-violation → D8 no-edit)
  - `422` — Zod validation failure (rating out of range, missing rating)
- **New shared types** `Review` / `SubmitReviewRequest` / `SubmitReviewResponse` in
  `@jojopotato/types`.
- **New `packages/ui` export** `StarRatingInput` (`value`, `onChange`, `max?`, `mode` (required),
  `testID?`).
- **FROZEN — must NOT change:** `OrderNotificationEvent` (AC4), the `useOrderQuery` poll contract
  (`staleTime:0` / `refetchIntervalInBackground:false` / terminal-stop `refetchInterval`),
  `PATCH /orders/:orderId/complete` request/response shape, the existing `ConfirmDialog` self-confirm
  flow on the tracking screen.

---

## Blast Radius

- **Packages touched:** 4 — `packages/api` (schema + migration + route + serializer),
  `packages/types` (new type file + barrel), `packages/ui` (new component + barrel + test),
  `apps/mobile` (5 new files + 1 edit).
- **File count:** ~13 new/edited (5 api, 2 types, 3 ui, 6 mobile — some overlap in edit vs new).
- **Risk class: HIGH.** New persistent user-generated-content surface + a new API route accepting
  user input + an ownership/trust-boundary decision on a customer-facing `:id`-scoped mutate route.
  This is the second customer-facing `:id`-scoped mutate route pattern after CART-003's
  `:lineId` ownership tests — reuse that regression discipline.
- **HIGH-RISK HANDOFF FLAG (for VALIDATE):** Per the repo's High-Risk Execution Handoff protocol
  (auth/ownership-boundary logic on a new route + new UGC persistence), this plan **may warrant the
  5-artifact `vc-risk-evidence-pack`** at VALIDATE/EXECUTE. **Do not generate the pack in PLAN** —
  VALIDATE should decide whether the ownership-boundary + UGC surface crosses the bar (it is
  narrower than deploy/payment/migration-destructive surfaces — the migration is purely additive,
  no `:id` beyond `:orderId`, no money path — so VALIDATE may reasonably judge it does NOT require
  the full pack, mirroring the CART-003 judgment).

---

## Derived Acceptance Criteria (locked-decision additions)

The SPEC's AC1-AC4 stand as written (see SPEC). D2/D3/D4/D5/D8 unlock these additional testable
criteria:

- **AC5 — Review persists with ownership enforced.** `POST /orders/:orderId/review` writes a
  `reviews` row for a completed order the caller owns; a non-owner gets 403 with no row written.
  `proven by:` `packages/api` vitest+supertest integration test (happy path + cross-user 403
  ownership regression, mirroring CART-003 line-ownership tests). `strategy:` Fully-Automated.
- **AC6 — Review is rejected for a non-completed order.** Reviewing a `ready`/`pending` order → 409,
  no row. `proven by:` integration test. `strategy:` Fully-Automated.
- **AC7 — No second review per order (D8).** A second `POST` for the same order → 409 (unique
  violation), original row unchanged. `proven by:` integration test. `strategy:` Fully-Automated.
- **AC8 — Rating validation.** `rating` outside 1-5 or missing → 422, no row. `proven by:`
  integration test. `strategy:` Fully-Automated.
- **AC9 — Celebration fires on live staff-completed diff.** Given `prevStatus='ready'`,
  `nextStatus='completed'`, `shouldCelebrate` returns `true`; given `prevStatus=undefined`
  (stale mount), returns `false`. `proven by:` pure-function vitest unit test. `strategy:`
  Fully-Automated.
- **AC10 — Star input is interactive.** Tapping star N sets value N and calls `onChange(N)`.
  `proven by:` jest-expo component test. `strategy:` Fully-Automated.
- **AC11 — On-device celebration feel.** Animation polish, gesture feel, light/dark rendering of the
  overlay + star input on a real device. `proven by:` manual Agent-Probe walkthrough. `strategy:`
  Agent-Probe (standing project-wide no-RN-E2E gap — NOT claimed as automated).

---

## Implementation Checklist

**Backend (packages/api):**
1. Create `packages/api/src/db/schema/reviews.ts` per the Public Contracts table shape (unique
   `order_id`, `CHECK` on rating optional), following `carts.ts` house style.
2. Add `export * from './reviews';` to `packages/api/src/db/schema/index.ts` in FK-dependency order.
3. Run `pnpm --filter @jojopotato/api db:generate` → produces `0020_*.sql` + snapshot; verify journal
   contiguity and that the SQL is additive-only (new table, no ALTER of existing tables).
4. Add `ApiReview` + `serializeReview` to `packages/api/src/routes/lib/serializers.ts` (integer
   rating, ISO `createdAt`, no cents conversion).
5. Add `POST /:orderId/review` to `packages/api/src/routes/orders.ts`: `requireSession`; Zod body
   schema (`rating` int 1-5, `comment` optional trimmed bounded); malformed id → 404; load order;
   **ownership BEFORE state** → 403; not-`completed` → 409; insert wrapped so a unique-violation on
   `order_id` maps to 409 (D8); return `200 { review }`.

**Shared types (packages/types):**
6. Create `packages/types/src/review.ts` (`Review`, `SubmitReviewRequest`, `SubmitReviewResponse`).
7. Add `export * from './review';` to `packages/types/src/index.ts`.

**UI component (packages/ui):**
8. Create `packages/ui/src/components/star-rating-input.tsx` (controlled, required `mode`, theme
   tokens only, `testID`).
9. Add barrel export to `packages/ui/src/index.ts`.

**Mobile (apps/mobile):**
10. Create pure `apps/mobile/src/features/orders/lib/celebration-trigger.ts` (`shouldCelebrate`).
11. Create `apps/mobile/src/features/orders/hooks/use-completion-celebration.ts` (prev-status ref +
    predicate + double-fire guard + `showCelebration`/`dismissCelebration`).
12. Add `submitReview()` to `apps/mobile/src/features/orders/lib/api-client.ts` (via `apiRequest`).
13. Create `apps/mobile/src/features/orders/hooks/use-submit-review.ts` (`useSubmitReview`).
14. Create `apps/mobile/src/features/orders/components/order-celebration-overlay.tsx` (reanimated-only
    celebration + review prompt embedding `StarRatingInput` + optional comment + Submit + Skip;
    dismissible, never blocks navigation — AC3).
15. Wire into `apps/mobile/src/app/(tabs)/tracking/index.tsx`: mount `useCompletionCelebration`, call
    `showCelebration` from the completion `onSuccess`, render the overlay gated on `celebrationVisible`.
    Do NOT touch the poll contract or `ready`-gate/ConfirmDialog logic.

**Tests (see Verification Evidence):**
16. Write the AC5-AC8 integration tests, AC9 pure-function test, AC10 component test, AC2/AC1/AC3
    component tests (TDD-first per repo convention — extract logic into pure fns where possible).

**Verify:**
17. Run all gate commands (see Verification Evidence). Fix inline until green.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test` — review happy path writes row for owned completed order | Fully-Automated | AC5 |
| `pnpm --filter @jojopotato/api test` — cross-user `POST /orders/:orderId/review` → 403, no row (ownership regression, mirrors CART-003 `:lineId`) | Fully-Automated | AC5 |
| `pnpm --filter @jojopotato/api test` — review on non-`completed` order → 409 | Fully-Automated | AC6 |
| `pnpm --filter @jojopotato/api test` — second review same order → 409, original unchanged | Fully-Automated | AC7 (D8) |
| `pnpm --filter @jojopotato/api test` — rating out of 1-5 / missing → 422, no row | Fully-Automated | AC8 |
| `pnpm --filter @jojopotato/api test` — grep/static: no new `OrderNotificationEvent` member added | Fully-Automated | AC4 |
| `pnpm --filter @jojopotato/mobile test` (vitest) — `shouldCelebrate('ready','completed')===true`; `shouldCelebrate(undefined,'completed')===false`; terminal-prev returns false | Fully-Automated | AC9, AC2 |
| `pnpm --filter @jojopotato/mobile test` (jest) — tracking screen: `onSuccess` self-confirm path fires celebration trigger | Fully-Automated | AC1 |
| `pnpm --filter @jojopotato/mobile test` (jest) — mount already-`completed` order → no celebration | Fully-Automated | AC2 |
| `pnpm --filter @jojopotato/mobile test` (jest) — Skip/dismiss closes prompt, no side effect, navigation not blocked | Fully-Automated | AC3 |
| `pnpm --filter @jojopotato/ui test` (jest-expo) — tap star N → value N, `onChange(N)` called | Fully-Automated | AC10 |
| `pnpm typecheck` + `pnpm lint` + `pnpm format:check` (all packages) | Fully-Automated | build integrity (widening `packages/types` barrel; new UI component) |
| On-device: celebration animation feel + light/dark overlay + star input polish (iOS + Android) | Agent-Probe | AC11 (standing no-RN-E2E gap — NOT automated) |

**Failing-stub note (for VALIDATE/EXECUTE):** the Fully-Automated rows above are the red-first TDD
targets. `pnpm --filter @jojopotato/api test` requires local Postgres (`docker compose up -d` +
`db:migrate`, or the native pg instance per `all-tests.md` dev-machine gotcha) before running.

---

## Failure Modes & Risks

- **Ownership check ordering** — if the not-`completed` (409) gate ran before the ownership (403)
  gate, a non-owner could distinguish order states across the trust boundary. **Mitigation:**
  ownership BEFORE state, verbatim from the `PATCH /:orderId/complete` precedent; regression test AC5.
- **Double celebration** — the self-confirm path both fires `onSuccess` AND produces a refetch
  `ready→completed` diff the detection hook also sees. **Mitigation:** per-order-id
  double-fire guard in `useCompletionCelebration`; predicate is idempotent per session.
- **False-fire on stale mount** — reopening a completed order. **Mitigation:** prev-status ref
  defaults `undefined`; `shouldCelebrate(undefined, ...)` is `false` (AC2/AC9).
- **jest layout-animation gap** — the overlay must not use `FadeIn`/`FadeOut`/entering-exiting layout
  animations (crashes under the current jest reanimated mock). **Mitigation:** use
  `useAnimatedStyle`/`useSharedValue`/`withTiming` only (the `LiveBadge` pattern), OR extend the mock
  first (see Test Infra Improvement Notes).
- **Poll-contract regression** — accidentally touching `useOrderQuery` options. **Mitigation:** do
  not edit `use-order-query.ts`; wire detection at the screen level.
- **Migration additivity** — must be a new table only, zero backfill, no ALTER of existing tables.
  **Mitigation:** review the generated `0020_*.sql` before applying; verify journal contiguity.

## Backwards Compatibility

Additive-only. New table (no backfill), new route (new path), new type file (barrel widen — grep
confirms no `Review`/`StarRatingInput` name collision), new UI export. No existing wire contract
changes. `OrderNotificationEvent` frozen. `useOrderQuery` poll contract untouched.

## Rollback

Single-table additive migration → rollback is a `DROP TABLE reviews` down-migration (or a forward
revert migration). Route/type/UI/mobile changes are additive and independently revertable via git.
No destructive data operation, no data mutation of existing tables.

---

## Test Infra Improvement Notes

- **jest reanimated mock lacks layout-animation exports** (`FadeIn`/`FadeOut`/`SlideInDown`/
  `SlideOutDown`/`Easing`/`cancelAnimation`) in `apps/mobile/src/test-utils/jest-setup.ts` — a
  screen using entering/exiting layout animations crashes at render under jest (known gap in
  `all-tests.md`). If the celebration overlay needs layout animations, EXECUTE must first extend the
  mock (small, unblocks animation-heavy screen coverage broadly) rather than degrade the test. If the
  overlay stays on `useAnimatedStyle`/`withTiming` (the `LiveBadge` pattern), no mock change needed.
- **No navigation-level RN E2E runner** (project-wide) — AC11 on-device feel stays Agent-Probe.
  Not introduced by this plan.

---

## Phase Completion Rules

- **CODE DONE** — all 17 checklist items applied and all Fully-Automated gate rows in Verification
  Evidence are green (api integration suite, mobile vitest + jest, ui jest-expo, typecheck/lint/format).
- **VERIFIED** — CODE DONE **plus** the AC11 on-device Agent-Probe walkthrough (celebration feel +
  light/dark overlay + star-input polish on iOS and Android) performed and confirmed by the user.
- Until AC11 is performed, the task folder **stays in `active/`** — do not archive to `completed/`,
  matching every other UI-polish plan in this repo carrying the standing no-RN-E2E-runner gap.
- A validate-contract with a PASS (or accepted CONDITIONAL) gate MUST exist before any EXECUTE work.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ordering-cart/active/order-completion-celebration_22-07-26/order-completion-celebration_PLAN_22-07-26.md`
2. **Last completed step:** PLAN written. No code changes made.
3. **Validate-contract status:** PENDING — VALIDATE has NOT run. A validate-contract is REQUIRED
   before EXECUTE (see Validate Contract placeholder below). VALIDATE must also decide the HIGH-RISK
   5-artifact evidence-pack question flagged in Blast Radius.
4. **Supporting context loaded:** SPEC (same task folder), `process/context/all-context.md`,
   `all-planning.md`, `all-tests.md`, `use-complete-order.ts`, `use-order-query.ts`,
   `tracking/index.tsx`, `orders.ts` (`PATCH /:orderId/complete`), `carts.ts` (schema house style),
   schema `index.ts`, types barrel, ui barrel, drizzle migration listing (latest `0019` → new `0020`).
5. **Next step for a fresh agent:** Run VALIDATE (`vc-validate-agent`) to produce the validate-contract
   (V1-V7), incorporating the AC1-AC11 gate table above and the HIGH-RISK evidence-pack decision.
   Do NOT start EXECUTE until the validate-contract exists and its gate is PASS (or accepted
   CONDITIONAL). Migration must be generated via drizzle-kit, never hand-numbered.

---

## Validate Contract

Status: CONDITIONAL
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 4/7 signals (S1 multi-package 4 pkgs, S2 schema+API+ownership surface, S6 high-risk trust-boundary class, S7 >=5 files) — HIGH; the 4 Layer-1 dimension checks + 4 Layer-2 section checks are independent read-only reviews with no mid-run coordination, so fire-and-forget parallel subagents fit (not agent-team). EXECUTE itself is a single sequential vc-execute-agent (opus) — the surfaces are interdependent (schema->route->serializer->type->client), not parallelizable.

### HIGH-RISK evidence-pack decision (the central VALIDATE call)

**Decision: the full 5-artifact `vc-risk-evidence-pack` is NOT warranted for this plan.** Reasoned justification (mirrors the explicitly-accepted CART-003 `:lineId` judgment):

- The risk class present is "permission / trust-boundary logic" (a new `:orderId`-scoped mutate route) + new UGC persistence — but it is **narrower than the deploy / payment / migration-destructive surfaces the pack is reserved for**:
  - **Additive-only migration** — new `reviews` table, no `ALTER` of existing tables, no backfill, zero destructive op; rollback is a clean `DROP TABLE reviews`.
  - **No money path** — `rating` is a plain integer (no cents, no `numericToCents`), no billing/credits/stars-ledger mutation. (`serializeReview` mirrors `serializeReward`'s integer passthrough, not `serializeOrder`'s money conversion.)
  - **Single, non-novel ownership boundary** — `:orderId` only (no `:cartId`/`:reviewId`), and the boundary is the THIRD instance of an already-tested pattern copied **verbatim** from `PATCH /orders/:orderId/complete` (orders.ts:635-671): malformed->404, load->404, ownership-BEFORE-state->403, then business gates. Not new trust-boundary logic — a re-application of a proven one.
  - **No secrets, no auth-provider change, no container/proxy/gateway surface.**
- **The trust boundary is proven by a Fully-Automated cross-user 403 regression test (AC5), Known-Gap BANNED** — for this risk class in this repo, an automated ownership-regression test is *stronger* evidence than a manual adversarial evidence pack, and matches the CART-003/ADM-003 discipline exactly.

**Proportionate control required in lieu of the pack (HARD):** AC5 (cross-user 403 ownership), AC6 (non-completed -> 409), AC7 (duplicate -> 409), AC8 (rating-range -> 422) MUST all be Fully-Automated red-first integration tests; **Known-Gap is BANNED on all four rows.** If EXECUTE cannot make any of AC5-AC8 a real passing automated test, STOP and escalate — do not downgrade to Agent-Probe or Known-Gap.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5 | POST /orders/:orderId/review writes a row for an owned completed order; cross-user caller -> 403, no row (ownership BEFORE state) | Fully-Automated | `pnpm --filter @jojopotato/api test` — happy-path + cross-user-403 supertest cases in a new `reviews.integration.test.ts` | A |
| AC6 | Review on a non-`completed` (ready/pending) order -> 409, no row | Fully-Automated | `pnpm --filter @jojopotato/api test` — non-completed-order case | A |
| AC7 | Second review for same order -> 409 (unique-violation), original row unchanged (D8) | Fully-Automated | `pnpm --filter @jojopotato/api test` — duplicate-insert case | A |
| AC8 | `rating` outside 1-5 or missing -> 422, no row | Fully-Automated | `pnpm --filter @jojopotato/api test` — Zod-boundary case | A |
| AC4 | No new `OrderNotificationEvent` member added (push surface frozen) | Fully-Automated | `pnpm --filter @jojopotato/api test` — static/grep regression assertion | A |
| AC9 / AC2 | `shouldCelebrate('ready','completed')===true`; `shouldCelebrate(undefined,'completed')===false`; terminal-prev -> false | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (vitest) — pure predicate unit test | A |
| AC1 | Self-confirm `onSuccess` path fires the celebration trigger | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — extends existing `(tabs)/tracking/__tests__/index.test.tsx` | A |
| AC2 | Mounting an already-`completed` order -> no celebration fires | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — stale-mount case in the tracking test | A |
| AC3 | Skip/dismiss closes the prompt, no side effect, navigation not blocked | Fully-Automated | `pnpm --filter @jojopotato/mobile test` (jest) — dismiss case | A |
| AC10 | Tap star N -> value N and `onChange(N)` called | Fully-Automated | `pnpm --filter @jojopotato/ui test` (jest-expo) — `star-rating-input.test.tsx` | A |
| build | typecheck + lint + format across touched packages (barrel widen, new UI export, new type file) | Fully-Automated | `pnpm typecheck && pnpm lint && pnpm format:check` | A |
| AC11 | On-device celebration feel + light/dark overlay + star-input polish (iOS + Android) | Agent-Probe | Manual walkthrough on real device | D |

gap-resolution legend: A — proven now (gate passes in this cycle) · B — fixed in this plan · C — deferred to a named later phase · D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: the `strategy` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is never a strategy here — AC11 is a named D-tier residual, not the sole proof of any developed behavior (every developed behavior AC1-AC10 has a Fully-Automated gate -> NOT vacuously green).

Legacy line form (retained for existing consumers):
- packages/api reviews route (AC5-AC8, AC4): Fully-automated: `pnpm --filter @jojopotato/api test` (precondition: local Postgres up + `db:migrate`; native pg instance per all-tests.md dev-box gotcha)
- apps/mobile predicate + screen (AC9/AC2/AC1/AC3): Fully-automated: `pnpm --filter @jojopotato/mobile test`
- packages/ui StarRatingInput (AC10): Fully-automated: `pnpm --filter @jojopotato/ui test`
- build integrity: Fully-automated: `pnpm typecheck && pnpm lint && pnpm format:check`
- on-device feel (AC11): agent-probe: documented (standing project-wide no-RN-E2E gap)

### Failing stubs (Fully-Automated rows, red-first TDD targets)

AC5 (packages/api):
test("POST /orders/:orderId/review writes a row for an owned completed order and 403s a cross-user caller with no row", () => { throw new Error("NOT IMPLEMENTED — TDD stub: review happy-path + cross-user ownership 403") })

AC6 (packages/api):
test("POST /orders/:orderId/review returns 409 with no row for a non-completed order", () => { throw new Error("NOT IMPLEMENTED — TDD stub: review rejected for non-completed order") })

AC7 (packages/api):
test("a second POST /orders/:orderId/review for the same order returns 409 and leaves the original row unchanged", () => { throw new Error("NOT IMPLEMENTED — TDD stub: duplicate review 409, no-edit") })

AC8 (packages/api):
test("POST /orders/:orderId/review returns 422 with no row when rating is out of 1-5 or missing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: rating range/required validation") })

AC4 (packages/api):
test("OrderNotificationEvent has no new member added by the review feature", () => { throw new Error("NOT IMPLEMENTED — TDD stub: push-surface-frozen static regression") })

AC9/AC2 (apps/mobile vitest):
test("shouldCelebrate fires on ready->completed and never on an undefined/terminal previous status", () => { throw new Error("NOT IMPLEMENTED — TDD stub: shouldCelebrate predicate transitions") })

AC1 (apps/mobile jest):
test("the self-confirm onSuccess path fires the celebration trigger", () => { throw new Error("NOT IMPLEMENTED — TDD stub: self-confirm celebration") })

AC2 (apps/mobile jest):
test("mounting an already-completed order does not fire the celebration", () => { throw new Error("NOT IMPLEMENTED — TDD stub: stale-mount no-celebration") })

AC3 (apps/mobile jest):
test("skipping the review prompt closes it with no side effect and does not block navigation", () => { throw new Error("NOT IMPLEMENTED — TDD stub: dismissible prompt") })

AC10 (packages/ui jest-expo):
test("tapping star N sets value N and calls onChange(N)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: StarRatingInput interaction") })

### Dimension findings

- Infra fit: CONCERN — Migration numbering verified correct (journal ends at idx 19 `0019_rainy_tombstone` -> next is `0020`; no sibling active plan currently claims `0020` or a `reviews` table). CONCERN is forward-looking only (E2): this is one of three concurrent plans, so EXECUTE must `db:generate` FRESH and accept whatever number drizzle assigns, never hard-code `0020`. No container/port/proxy surface. `db:generate` path + additive-only migration confirmed.
- Test coverage: PASS — Every developed behavior AC1-AC10 has a Fully-Automated gate; AC11 is the only Agent-Probe (named D-tier residual, standing no-RN-E2E gap, not the sole proof of anything). STALE-CONTEXT NOTE (E3): the plan's Test Infra Improvement Notes + `all-tests.md` treat the jest reanimated mock as lacking layout-animation exports — this is OUT OF DATE. The mock at `apps/mobile/src/test-utils/jest-setup.ts` now provides `Easing`, `withRepeat`, AND `FadeIn/FadeOut/SlideIn/SlideOut...` (via a Proxy for any modifier). The celebration overlay may use `FadeIn`/`FadeOut` layout animations freely and mounting the tracking screen under jest is already proven (existing `tracking/__tests__/index.test.tsx`). No mock extension is required — a risk-reducing correction.
- Breaking changes: PASS — Additive-only. Grep confirms zero `StarRatingInput`/`Review` name collisions in `packages/types`/`packages/ui` -> barrel widen safe. Frozen contracts explicitly protected: `OrderNotificationEvent` (AC4 regression), `useOrderQuery` poll contract (LIVE-001 E4 — screen-level wiring only, `use-order-query.ts` untouched), `PATCH /:orderId/complete` shape, existing `ConfirmDialog` flow.
- Security surface: CONCERN — Ownership boundary mirrors the `PATCH /:orderId/complete` verbatim precedent (STRONG: ownership-BEFORE-state, malformed->404 no existence oracle). CONCERN (E1): the route-level mechanism that maps a duplicate-`order_id` insert to a clean 409 (vs a leaked 500) is underspecified. The DB `UNIQUE(order_id)` constraint is the correctness backstop (a duplicate WILL fail atomically), but the 409 mapping needs a concrete mechanism — see E1.
- Section A feasibility (packages/api schema+migration+route+serializer): CONCERN — Mechanically feasible (ownership template + `carts.ts` `.unique()` style + `serializeReward` integer precedent all available verbatim). Highest-risk edit: the ownership-before-state ordering in the new route — mitigation: copy orders.ts:635-671 structure verbatim. Gap: unique-violation->409 mechanism (E1).
- Section B feasibility (packages/types): PASS — Trivial additive type file + barrel export; no collision.
- Section C feasibility (packages/ui StarRatingInput): PASS — Clear house-style precedent (`star-progress-bar.tsx`: `Colors[mode]` tokens, required `ThemeMode`, pure View/StyleSheet). No collision. Required `mode` prop (no default) per convention.
- Section D feasibility (apps/mobile trigger+hook+overlay+wiring): PASS — `shouldCelebrate` predicate design is sound for AC2 (prev=undefined->false on stale/already-completed mount) AND AC9 (ready->completed->true); self-confirm uses `onSuccess` directly; per-order-id once-per-session double-fire guard closes the onSuccess-then-poll-diff double path. Highest-risk edit: wiring into `tracking/index.tsx` without touching the poll contract — mitigation: screen-level wiring only, do not edit `use-order-query.ts`; seed the prev-status ref on first render WITHOUT firing, compare only on subsequent changes.

### Execute-agent instructions

- **E1 (duplicate-review 409 mapping — trigger: Section A, the review-insert step).** Enforce D8 at TWO layers: (1) DB `UNIQUE(order_id)` constraint on `reviews` (the atomic race backstop), AND (2) a route-level clean-409 path. Recommended: pre-`SELECT` for an existing review row for this `order_id` -> throw `OrderError(409, ...)` for the friendly common case; wrap the `INSERT` in a catch that maps a Postgres unique-violation to 409 as the race backstop. Reuse `isUniqueViolation(err)` from `packages/api/src/routes/admin/lib/errors.ts` (it already handles the drizzle `err.cause.code === '23505'` wrapping gotcha) rather than re-checking only the top-level code (a top-level-only check silently 500s). Do NOT let a duplicate insert surface as a 500. AC7 proves this is non-vacuous.
- **E2 (migration freshness — trigger: checklist step 3).** Do NOT hard-code `0020`. Run `pnpm --filter @jojopotato/api db:generate` at EXECUTE time and accept whatever number drizzle-kit assigns (could be `0021+` if a concurrent sibling plan lands first). Verify journal contiguity and that the generated SQL is additive-only (new table, zero `ALTER` of existing tables) before applying.
- **E3 (jest mock is already capable — trigger: Section D overlay).** The `all-tests.md`/plan note about the jest reanimated mock lacking layout animations is STALE. `apps/mobile/src/test-utils/jest-setup.ts` already exports `Easing`, `withRepeat`, and all `FadeIn/FadeOut/SlideIn/SlideOut` builders. Use `FadeIn`/`FadeOut` freely if desired; do NOT spend effort extending the mock — it is unnecessary. Mounting the tracking screen under jest is already proven by the existing `(tabs)/tracking/__tests__/index.test.tsx`.
- **E4 (ownership pattern verbatim — trigger: Section A route).** Copy the guard ordering from `orders.ts` `PATCH /:orderId/complete` (lines 635-671) VERBATIM: malformed id -> 404 (no 400, no existence oracle); load order -> 404; `order.user_id !== userId` -> 403 BEFORE any state gate; not-`completed` -> 409. Do not reorder these gates.
- **E5 (proportionate control for the waived evidence pack — trigger: all of Section A tests).** AC5/AC6/AC7/AC8 are the substitute for the 5-artifact risk pack. All four MUST be real passing Fully-Automated tests; Known-Gap is BANNED on all four. If any cannot be automated, STOP and escalate — do not proceed to CODE DONE.

### Open gaps

- AC11 (on-device celebration feel + light/dark overlay + star-input polish, iOS + Android): known-gap — standing project-wide no-RN-E2E-runner gap (D-tier named residual, per the plan's own Phase Completion Rules; task folder stays in `active/` until performed). NOT the sole proof of any developed behavior.

### What this coverage does NOT prove

- AC5-AC8 integration tests prove the ownership/duplicate/state/validation boundaries at the HTTP+DB layer; they do NOT prove on-device UX of the submit flow (that a real tap submits and the prompt reflects submitted state) — that is AC11 Agent-Probe.
- AC9/AC2 vitest proves the `shouldCelebrate` predicate in isolation; it does NOT prove the prev-status ref is wired correctly into the live poll (that the ref seeds without firing and updates after the check) beyond what the AC1/AC2 jest screen tests assert.
- AC1/AC2/AC3 jest tests prove the trigger fires/does-not-fire and the prompt dismisses at the component level under the jest reanimated mock; they do NOT prove real reanimated animation timing, gesture feel, or light/dark rendering on a device — AC11 Agent-Probe.
- AC10 jest-expo proves star-tap -> value/onChange; it does NOT prove visual star fill states or light/dark token rendering on a device — AC11 Agent-Probe.
- build gates (typecheck/lint/format) prove type/style integrity; they do NOT prove runtime behavior of any new surface.
- No gate proves the migration applies cleanly against a production-like DB at scale (additive single-table migration; rollback is `DROP TABLE reviews`) — accepted, additive-only, no destructive op.

### Dimension gate summary

Totals: 0 FAILs / 3 CONCERNs / 5 PASSes (Layer1: Infra CONCERN, Test PASS, Breaking PASS, Security CONCERN; Layer2: A CONCERN, B PASS, C PASS, D PASS).

Gate: CONDITIONAL (concerns noted, session-accepted — all three are execute-agent instructions E1/E2/E3 with clear mitigations; the DB unique constraint is the correctness backstop for the sole correctness-adjacent concern E1, and AC7 proves it non-vacuous; no FAILs; no developed behavior rests on Known-Gap -> not vacuously green)
Accepted by: session (VALIDATE, autonomous per spawn instruction) — accepted concerns: E1 duplicate-review 409 route-level mapping mechanism; E2 migration-number freshness (generate-not-hardcode); E3 stale jest-mock-gap context (risk-reducing correction)

---

## Autonomous Goal Block

```
SESSION GOAL: Order Completion Celebration + Review Prompt — reanimated celebration + persisted star-rating/comment on the tracking screen when an order reaches `completed`.
Charter + umbrella plan: N/A — single plan (process/features/ordering-cart/active/order-completion-celebration_22-07-26/order-completion-celebration_PLAN_22-07-26.md)
Autonomy: standard interactive RIPER-5 (no /goal active). VALIDATE done -> EXECUTE requires explicit ENTER EXECUTE MODE.
Hard stop conditions / safety constraints:
- AC5/AC6/AC7/AC8 (ownership 403, non-completed 409, duplicate 409, rating 422) MUST be real passing Fully-Automated tests — Known-Gap BANNED. If any cannot be automated, STOP and escalate (proportionate control replacing the waived 5-artifact risk pack).
- Ownership check BEFORE state gate, verbatim from PATCH /orders/:orderId/complete (orders.ts:635-671). Do not reorder.
- Migration: db:generate FRESH at EXECUTE, accept drizzle's assigned number (do NOT hard-code 0020); additive-only, verify journal contiguity.
- Do NOT touch the useOrderQuery poll contract (staleTime:0 / refetchIntervalInBackground:false / terminal-stop) or add any OrderNotificationEvent member (AC4).
Next phase: EXECUTE — vc-execute-agent (opus), single sequential run (schema->migration->serializer->route->types->ui->mobile->tests).
Validate contract: inline in this plan (## Validate Contract, Gate: CONDITIONAL, generated-by: outer-pvl).
Execute start: pnpm --filter @jojopotato/api test | pnpm --filter @jojopotato/mobile test | pnpm --filter @jojopotato/ui test | pnpm typecheck && pnpm lint && pnpm format:check | high-risk pack: NO (reasoned waiver — see Validate Contract; substitute = Known-Gap-banned AC5-AC8 automated tests) | AC11 on-device Agent-Probe owed before VERIFIED
```
