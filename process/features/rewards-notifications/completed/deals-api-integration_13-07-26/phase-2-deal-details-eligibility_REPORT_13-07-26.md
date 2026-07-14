---
phase: phase-2-deal-details-eligibility
date: 2026-07-14
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/deals-api-integration_13-07-26/phase-2-deal-details-eligibility_PLAN_13-07-26.md
---

# Phase 2 — Deal Details + Eligibility (DEAL-002 / #23) — EXECUTE Report

## What Was Done

Backend (items 1–3, automated-gated):
1. `packages/api/src/routes/deals.ts` — added `dealsRouter.get('/:id', ...)` after the existing `GET /`. uuid-validate → 404; `and(eq(deals.id,id), eq(deals.is_active,true))` → 404 on missing/inactive; fetches this deal's `dealBranches`/`dealProducts` rows, flattens to `string[]`, returns `{ deal: serializeDeal(deal, branchIds, productIds) }`. NO window/branch filter (decisions 2 & 4). `serializeDeal` reused verbatim.
2. `packages/api/src/routes/__tests__/deals.test.ts` — added `describe('GET /deals/:id')` with 7 cases reusing existing hermetic fixtures: 200+`{deal}`+field-name guard; money parity (agnostic 20/'20% OFF'/1500 + scopedFixed 5000/'₱50 OFF'); branch-agnostic-independence; expired-but-active→200 `isActive===true` (P1 window-independence); 404 inactive; 404 unknown-uuid; 404 malformed (not 500).
3. Ran the API gate — full suite green.

Mobile (items 4–7, Agent-Probe-gated):
4. `apps/mobile/src/lib/api-client.ts` — added `getDeal(dealId)` alongside `getDeals`; `{ deal }` unwrap; reuses `getJson`/`commonHeaders`; 404 throws.
5. `apps/mobile/src/features/deals/hooks/use-deal.ts` — CREATED; genuine `useQuery({ queryKey: ['deal', dealId], queryFn: () => getDeal(dealId), enabled: !!dealId })` (decision 6 — not derive-from-list).
6. `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` — swapped `MOCK_DEALS`/`MOCK_DEAL_USAGE`/`applyDealById` imports out; now `useDeal(dealId)` + `checkDealEligibility(deal, cart, cart.pickupBranchId, [])` (`usage: []`, decision 3). Added `isLoading` (ActivityIndicator) + `isError||!deal` (EmptyState "Deal not found") states. Apply CTA deferred (E1): enabled→`Alert` with "Go to cart"/"OK"; plus persistent helper copy below the button in BOTH eligible and ineligible branches, so the CTA never lacks visible feedback. No `applyDealById`/`applyResolvedDeal`/`applyDiscount` imported or called.
7. Ran mobile gates — green.

## What Was Skipped or Deferred

- Real usage-limit gating — forward-referenced Known-Gap to Phase 3 (`orders.deal_id` does not exist yet); interim `usage: []` is provably always-pass at display time. Not built (out of Phase 2 blast radius).
- Real Apply (server-authoritative discount + placement) — Phase 3. Deliberately deferred; `apply-deal.ts`/`mock-deals.ts` untouched.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| API suite (incl. new `/:id` cases) | `pnpm --filter @jojopotato/api test` | PASS — 8 files, 69 tests passed; `deals.test.ts` 13 tests (6 list + 7 new `/:id`) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS (exit 0) |
| types typecheck | `pnpm --filter @jojopotato/types typecheck` | PASS (exit 0) |
| Mobile typecheck | `pnpm -C apps/mobile exec tsc --noEmit` | PASS (exit 0) |
| API lint | `pnpm --filter @jojopotato/api lint` | PASS (exit 0) |
| Mobile lint | `pnpm --filter @jojopotato/mobile lint` | PASS (exit 0; 3 pre-existing warnings in `scripts/dev-with-tunnel.mjs`, unrelated to this change) |

## AC Status (#23 DEAL-002)

- AC23.1 (details renders from `GET /deals/:id`; input/not-found guards): automated-green (endpoint 200+shape+field-names + 3×404) / render Agent-Probe-pending.
- AC23.2 (money parity single-read): automated-green.
- AC23.3 (eligible → Apply deferred, no real apply; build guard): automated-green (tsc/lint prove `applyDealById`/`applyDiscount` no longer imported) / UX Agent-Probe-pending.
- AC23.4 (below-minimum reason): Agent-Probe-pending.
- AC23.5 (branch-ineligible; route returns deal regardless of branch): automated-green (route half — branch-agnostic-independence case) / message Agent-Probe-pending.
- AC23.6 (product + window messages; usage-limit): window route-half automated-green (expired→200 `isActive===true`) / product+window messages Agent-Probe-pending / usage-limit accepted-gap (forward-ref Phase 3).

## Plan Deviations

None. All 7 checklist items implemented exactly as specified. E1 satisfied via enabled-CTA Alert + persistent helper copy in both branches (plan permitted either disabled-with-copy OR enabled-with-Alert; implemented a stronger both-visible form). No forbidden files touched.

## Test Infra Gaps Found

- No RN test runner (project-wide) — client render, 6 eligibility-reason screen states, and deferred-Apply UX are Agent-Probe only. Tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. The `packages/api` `deals.test.ts` `/:id` cases ARE the automated endpoint gate.

## EVL Confirmation (independent re-run)

vc-tester re-ran the exact validate-contract gate commands independently of execute-agent's internal
green claim. All 6 gates confirmed GREEN:

| Gate | Command | Result |
|---|---|---|
| API suite (incl. `/:id`) | `pnpm --filter @jojopotato/api test` | PASS — 69 passed, `deals.test.ts` 13 (6 list + 7 `/:id`) |
| API typecheck | `pnpm --filter @jojopotato/api typecheck` | PASS |
| types typecheck | `pnpm --filter @jojopotato/types typecheck` | PASS |
| Mobile typecheck | `pnpm -C apps/mobile exec tsc --noEmit` | PASS |
| API lint | `pnpm --filter @jojopotato/api lint` | PASS |
| Mobile lint | `pnpm --filter @jojopotato/mobile lint` | PASS |

**Blast radius conformance:** CONFORMANT — diff touches exactly the 5 claimed Phase 2 files
(`deals.ts`, `deals.test.ts`, `api-client.ts`, `use-deal.ts` new, `[dealId].tsx`). No
`packages/api/src/db/` changes. `apply-deal.ts`, `use-cart.ts`, `mock-deals.ts` untouched — verified
by direct diff inspection.

**E1 / decision-2/4 direct-code-read verification:**
- `/:id` handler queries `id + is_active` only — no branch or window filter present in the route body
  (decisions 2 and 4 confirmed by reading the route, not inferred from the plan).
- `[dealId].tsx` has zero import of `applyDealById`, `applyResolvedDeal`, or `applyDiscount` (Apply
  deferral confirmed by direct grep of the file's import block).
- The deferred CTA gives visible feedback in both branches — persistent helper copy plus an
  `Alert` on tap when enabled; no silent/dead-button state exists in the source.

**Accepted known-gaps (unchanged from PVL):**
- Client render, the 6 eligibility-reason screen states, and the deferred-Apply UX are Agent-Probe
  only (no RN runner — standing project-wide gap). Owed: user's manual Agent-Probe walkthrough.
- Usage-limit real gating is a forward-referenced Known-Gap to Phase 3 (`orders.deal_id` does not
  exist yet); interim `usage: []` is provably always-pass, not a fabricated pass.

**closeout_classification: CLEAN**

## Closeout Packet

- Selected plan: `.../phase-2-deal-details-eligibility_PLAN_13-07-26.md`
- Finished: `GET /deals/:id` + 7 automated cases; mobile `getDeal`/`useDeal`/screen swap; deferred Apply CTA (E1).
- Verified: all 6 automated gates independently re-confirmed by vc-tester (EVL run) — API suite, 3 typechecks, 2 lints. Blast radius conformant. E1/decisions 2&4 confirmed by direct code read.
- Unverified: mobile Agent-Probe walkthrough (render / not-found / 6 reason states / deferred-Apply UX) — owed, non-blocking (no RN runner; standing project-wide gap).
- Remaining: user Agent-Probe walkthrough (non-blocking); commit (Phase 1 + Phase 2 changes are both still uncommitted — see umbrella note); Phase 3 (HIGH RISK — requires the manual-first high-risk evidence pack before finalize).
- Closeout classification: **Ready for UPDATE PROCESS archival at the phase level** (EVL-confirmed clean; program itself stays active — this is an inter-phase closeout, not final program archival).

## SPEC Achievement

Governed by the umbrella charter (phase-program inner loop skips a per-phase SPEC). Scoring against
umbrella Definition-of-Done item 2 + AC23.1–AC23.6 (#23 DEAL-002):

| Criterion | Status | proven by |
|---|---|---|
| AC23.1 — Deal Details renders real deal from `GET /deals/:id`; 404 guards | **met** (endpoint) — render half Agent-Probe-pending | `deals.test.ts` `/:id` (Fully-Automated) |
| AC23.2 — Money parity on single-read path | **met** | `deals.test.ts` `/:id` cents/percentage/label cases (Fully-Automated) |
| AC23.3 — Eligible → Apply deferred, no real apply | **met** (build guard) — UX half Agent-Probe-pending | `tsc`/lint prove no `applyDealById` import (Fully-Automated) |
| AC23.4 — Below-minimum reason with exact shortfall | **unmet (Agent-Probe-only, pending)** | backlog: user Agent-Probe walkthrough owed |
| AC23.5 — Branch-ineligible; route returns deal regardless of branch | **met** (route half) — message half Agent-Probe-pending | `deals.test.ts` branch-agnostic-independence case (Fully-Automated) |
| AC23.6 — product/window messages; usage-limit | **met** (window route half) — messages Agent-Probe-pending; usage-limit **unmet, accepted Known-Gap → Phase 3** | `deals.test.ts` expired-window case (Fully-Automated); usage-limit forward-ref (gap-resolution D) |

Per the vacuous-green ban: only criteria with a passing Fully-Automated or Hybrid gate are scored
**met**. The render/UX/message halves of AC23.1/23.3/23.5/23.6 and all of AC23.4 rest on Agent-Probe
only (no automated RN runner exists) and are NOT scored met — they are pending backlog items, not
claimed coverage. Usage-limit (AC23.6) is an explicit, accepted Known-Gap forward-referenced to
Phase 3, not a vacuous pass.

**Backlog stub for unmet/pending items:** tracked under the existing
`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` (no RN runner —
covers all Agent-Probe-pending halves above). Usage-limit gap is tracked in-plan (Known Gaps section
of the Phase 2 plan) and resolved by Phase 3, not a new backlog note.

## Forward Preview

- **Test Infra Found:** vitest+supertest in `packages/api` is the endpoint gate; no mobile runner (standing gap).
- **Blast Radius Changes:** `deals.ts` now has `GET /` + `GET /:id`. `api-client.ts` exports `getDeal`. New `use-deal.ts` hook. `[dealId].tsx` no longer imports `mock-deals`/`apply-deal`. Phase 3 write surface (`orders.ts`, migration, `use-cart.ts`, `cart.tsx`) untouched — disjoint.
- **Commands to Stay Green:** `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`; `pnpm -C apps/mobile exec tsc --noEmit`.
- **Dependency Changes:** none (no new packages).
