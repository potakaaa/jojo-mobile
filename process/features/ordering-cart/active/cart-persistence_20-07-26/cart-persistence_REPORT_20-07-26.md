---
phase: cart-persistence
date: 2026-07-20
status: COMPLETE_WITH_GAPS
feature: ordering-cart
plan: process/features/ordering-cart/active/cart-persistence_20-07-26/cart-persistence_PLAN_20-07-26.md
---

# EXECUTE REPORT: Persist Cart Server-Side (CART-003, GitHub #99)

Status: **CODE DONE — EVL-confirmed green — NOT VERIFIED** (4 Agent-Probe manual walkthroughs
owed; plan stays in `active/` per its own Phase Completion Rules).

## What Was Done

Built the full server-side cart persistence layer per the VALIDATE-PASS plan:

- **Schema** — `packages/api/src/db/schema/carts.ts` (unique `user_id` FK mirroring the
  `user_stars.ts` one-row-per-user idiom, nullable `branch_id`, 4 denormalized `discount_*`
  columns) + `cart_items.ts` (`cart_id` cascade-delete FK, `product_id` no-action FK,
  app-level `quantity > 0` / `selected_options` enforcement, mirroring `deal_components.ts`).
- **Migration** — `packages/api/drizzle/0017_fast_the_hood.sql`, generated fresh against the
  live journal (tip was `0016_rename_offer_fk_constraints`, re-verified at EXECUTE time as the
  plan required — not hardcoded). Applies cleanly to local Postgres.
- **Revalidation helper** — `packages/api/src/routes/lib/cart-revalidation.ts`
  (`resolveCartLineValidity`), structurally mirroring MENU-003's
  `resolveAvailableDealProductIds` — batched ≤4 queries, delegates deal-component checks to the
  existing MENU-003 helper so cart and order-placement can never disagree on deal-product
  orderability.
- **Serializer** — `ApiCart`/`ApiCartItem`/`serializeCart` added to `serializers.ts`, following
  `serializeOrder`'s cents-conversion pattern (`numericToCents`/`centsToNumeric`); items are
  live-priced at read time with per-line `conflict` flags.
- **Route** — `packages/api/src/routes/cart.ts`, all 8 endpoints from the plan's Public
  Contracts table (`GET /cart`, `POST /cart/items`, `PATCH/DELETE /cart/items/:lineId`,
  `DELETE /cart`, `PUT /cart/branch`, `POST/DELETE /cart/discount`). Mounted at
  `app.use('/cart', requireSession, cartRouter)` in `index.ts`, matching the `/coupons`
  precedent (bare `requireSession` reference, not a factory call). Atomic find-or-create,
  cart-level (403 not-yours) + line-level (`lineId` ownership join) enforcement, app-level
  line-merge-on-add, server always re-prices — client-supplied price is rejected.
- **Types** — additive `CartItemConflict` + `conflict?` on `CartItem` in
  `packages/types/src/cart.ts`; existing fields untouched.
- **Tests** — `packages/api/src/routes/__tests__/cart.integration.test.ts`, 15 hermetic
  self-seeding tests covering AC1 (Hybrid automated half) through AC10, plus line-merge,
  no-phantom-item, and client-price-ignored cases.
- **Mobile hook** — `apps/mobile/src/features/cart/hooks/use-cart.ts` rewritten internally onto
  `useQuery(['cart', userId])` + 7 `useMutation`s with optimistic `onMutate`/`onError`/
  `onSettled`-invalidate. The exported `useCart()` public API is byte-identical — confirmed by
  zero edits to any of the 8 real consumer files (cart/checkout screens, product detail, Home
  add-to-cart bar, `use-reorder.ts`, `use-deals.ts`, `use-deal-products.ts` — the last three were
  not in the plan's original prose list and were added to Blast Radius during VALIDATE's grep
  sweep; the sweep's own re-run at EXECUTE time confirmed the same 8-file set with zero breaks).
- **New mobile API client** — `apps/mobile/src/features/cart/lib/cart-api.ts`, built on the
  session-carrying `apiRequest()` wrapper (per VALIDATE's correction — NOT the unauthenticated
  `getJson()`), with `productId` → `menuItemId` field-name reconciliation applied at the hook
  boundary (naming-only, not a behavior change, per the plan's explicit callout).

## What Was Skipped / Deferred

Nothing from the plan's Implementation Checklist was skipped. Everything explicitly marked
out-of-scope in the SPEC (screen/UI redesign, `POST /orders` pricing-decision logic, new discount
mechanics, payment-method persistence, guest carts, multi-cart/wishlist, real-time cross-device
push sync, star/rewards/deal-eligibility changes, admin cart views) remained untouched — confirmed
by the blast-radius match against `git status` (11 files total, all within the plan's stated
Touchpoints).

Deferred to Agent-Probe (owed by the user, not by this EXECUTE pass — see Phase Completion Rules
in the plan):
- AC1-manual — on-device force-quit + reopen shows the same cart
- AC2-manual — on-device sign-out/sign-in walkthrough
- AC6-manual — on-screen branch-switch experience
- AC9-manual — on-device checkout walkthrough from a persisted cart

## Test Gate Outcomes

Independently re-confirmed by a separately spawned EVL run (not taken on execute-agent's own
report):

| Gate | Command | Result |
|---|---|---|
| `packages/api` full suite | `pnpm --filter @jojopotato/api test` | 520/520 green (was 505 before this plan; +15 new cart tests) |
| `apps/mobile` vitest | `pnpm --filter @jojopotato/mobile test` (vitest) | 65/65 green |
| `apps/mobile` jest | `packages/ui`/`apps/mobile` jest suite | 78/78 green |
| `packages/api` typecheck | `pnpm --filter @jojopotato/api typecheck` | 0 errors |
| `packages/types` typecheck | `pnpm --filter @jojopotato/types typecheck` | 0 errors |
| `packages/ui` typecheck | `pnpm --filter @jojopotato/ui typecheck` | 0 errors |
| `packages/utils` typecheck | `pnpm --filter @jojopotato/utils typecheck` | 0 errors |
| `apps/mobile` typecheck | `pnpm --filter @jojopotato/mobile typecheck` | 2 pre-existing errors (NAV-005 typed-route staleness in `navigate-to-branch.ts`/`navigate-to-product.ts`) — confirmed unrelated, files never touched by this plan |
| Prettier | `pnpm format:check` on touched files | clean |
| Migration | `db:migrate` against local Postgres | applies cleanly, `0017_fast_the_hood.sql` |

Both HARD, Known-Gap-banned gates were independently confirmed non-vacuous (would fail if the
guard were removed), not just passing assertions:
- **AC4** (cross-user cart + line-level ownership isolation)
- **AC8-snapshot** (order-snapshot-integrity regression, mirroring ADM-003's pattern)

## Plan Deviations

Four deviations, all flagged by execute-agent, all within the plan's own blast radius, none
hard-stop:

1. Added `scope: { id: 'cart-mutations' }` to every cart mutation so react-query serializes them
   in call order. Needed because `use-reorder.ts` relies on ordered
   `setBranch → clearCart → addItem×N`; without serialization, concurrent unordered writes could
   race. Implementation detail only — `useCart()`'s public API is unaffected.
2. `resolveCartLineValidity` also checks deal-component availability via the existing
   `resolveAvailableDealProductIds`, so cart and order-placement can never disagree on
   deal-product orderability (MENU-003 consistency) — broader than the plan's literal "product
   unavailable" framing but consistent with its stated intent.
3. Line ownership status-code split resolved as: 404 for a nonexistent `lineId`, 403 for another
   user's line. The plan left the exact split to EXECUTE; this satisfies AC4-line.
4. `GET /cart`'s query is gated `enabled: userId !== null` so unauthenticated screens don't
   401-spam; falls back to an empty-cart constant.

## Test Infra Gaps Found

None new. Two pre-existing, already-documented gaps were re-observed and correctly NOT re-filed:

- A transient `ECONNRESET` on the first API-suite run this session, resolved by a clean re-run
  (520/520) — matches the existing `api-test-db-concurrency-guard_NOTE_17-07-26.md` backlog flake.
- Repo-wide CRLF `format:check` drift (`crlf-line-ending-format-check-drift_NOTE_17-07-26.md`) —
  pre-existing; the 11 files this plan touched are individually Prettier-clean.

## SPEC Achievement

| AC | Criterion | Status |
|---|---|---|
| AC1 | Cart survives app restart | **met** (Hybrid automated half real & passing; manual half owed, see below) |
| AC2 | Cart survives sign-out/sign-in | **met** (Hybrid automated half real & passing; manual half owed) |
| AC3 | Cart visible across devices for the same account | **met** — Fully-Automated |
| AC4 | Cross-user isolation (cart + line-level) | **met** — Fully-Automated, Known-Gap banned, confirmed non-vacuous |
| AC5 | Add/update-quantity/remove/clear each persist | **met** — Fully-Automated |
| AC6 | Branch switch hard-clears items+discount | **met** (Fully-Automated automated half; manual on-screen half owed) |
| AC7 | Unavailable product flagged as conflict | **met** — Fully-Automated |
| AC8 | Live price on read + order-snapshot integrity | **met** — Fully-Automated, Known-Gap banned, confirmed non-vacuous |
| AC9 | Checkout from persisted cart round-trips correctly | **met** (Hybrid automated half; manual checkout walkthrough owed) |
| AC10 | Full automated suites green | **met** — Fully-Automated (API 520/520, mobile vitest 65/65 + jest 78/78) |

All 10 ACs' automated/Hybrid-automated halves are met with real passing gates — none rest on
Known-Gap. The 4 Agent-Probe manual halves (AC1/AC2/AC6/AC9) are explicitly the standing,
project-wide no-RN-runner residual (same class as MENU-003, MENU-004, mobile-dark-mode-audit) —
owed before **VERIFIED**, not before **CODE DONE**. No SPEC Gaps to file to backlog; every AC has
a concrete "met" automated proof, and the manual halves are already tracked by the plan's own
Phase Completion Rules rather than needing a separate backlog stub.

## Closeout Packet

1. **Selected plan path:** `process/features/ordering-cart/active/cart-persistence_20-07-26/cart-persistence_PLAN_20-07-26.md`
2. **Closeout classification:** Keep in active/testing (CODE DONE, not yet VERIFIED)
3. **What was finished:** full server-side cart persistence — schema, migration, API route
   family, revalidation helper, serializer, mobile hook rewrite — see "What Was Done" above
4. **Verified vs unverified:** all 10 ACs' automated/Hybrid-automated halves independently
   EVL-confirmed green; AC1/AC2/AC6/AC9's Agent-Probe manual halves remain unverified (owed by
   the user)
4b. **Validate-contract compliance:** VALIDATE was run; `## Validate Contract` is present inline
   in the plan file with `Gate: PASS` (no CONDITIONAL, no BLOCKED, no Known-Gap rows)
5. **Cleanup done vs still needed:** this UPDATE PROCESS pass writes this report, updates the
   plan's Resume/status section, and updates `process/context/all-context.md`; still needed is
   the 4 owed Agent-Probe walkthroughs before the task folder can move to `completed/`
6. **Next valid state:** Keep the plan active and continue only via the 4 owed Agent-Probe
   walkthroughs — no further code changes are planned for this scope
7. **Commit checkpoint:** Execution commit recommended before archival reconciliation — 11
   uncommitted files (6 modified, 5 new under `packages/api`/`apps/mobile`, plus the new task
   folder) sit ready for a single logical `feat(api,mobile): persist cart server-side (CART-003)`
   commit; not created by this UPDATE PROCESS pass — see "Not Committed" note below
8. **Regression status:** n/a (not a phase-program; single plan)
9. **SPEC achievement:** see table above — all 10 ACs met on their automated/Hybrid-automated
   halves; 4 Agent-Probe manual halves owed, not new backlog items

Drift score: MEDIUM (2 signals — (a) 11 files touched crosses the ≥10-file +2 threshold on its
own [+2]; (d) new feature-folder task folder created [+1] → raw count 3, but (b1)/(b2)/(c)/(e) do
not apply: no harness/agent files, no README/AGENTS/CLAUDE.md/protocol-doc edits, fewer than 3
new memory-worthy observations beyond what's already captured in the plan's own Dependencies/Risks
section, and zero validate-contract deviation — final signal count 3).
Recommend UPDATE PROCESS -- significant changes detected.

## Not Committed

Per this task's instructions, `vc-git-manager` was explicitly out of scope for this UPDATE
PROCESS pass. All 11 touched/new files remain uncommitted on `development` as of this report. A
commit is recommended (see Closeout Packet item 7) but left for the orchestrator/user to invoke
separately.
