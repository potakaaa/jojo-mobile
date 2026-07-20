---
name: plan:adm-route-guard-ssr
description: "Fix (dashboard) beforeLoad guard skipping auth check during SSR — set ssr:false, drop typeof-document early-return"
date: 20-07-26
feature: admin-dashboard
---

# ADM Route Guard SSR Fix — Plan

**Date**: 20-07-26
**Status**: DRAFT — awaiting VALIDATE
**Complexity**: SIMPLE (single-file behavioral fix, one already-decided approach)
**SPEC/INNOVATE:** Skipped — bug fix with a single locked approach (see Decision below), no
product-discovery surface, no open design choice. RESEARCH already identified root cause and
approach; nothing left to spec or innovate.

## Overview

`apps/admin`'s `(dashboard)` layout route fails to enforce its auth guard on hard page loads
(SSR + hydration reuse skips the check), so a logged-out user briefly sees full dashboard chrome
before any redirect on a direct URL load or refresh. This plan fixes it by disabling SSR on the
route (`ssr: false`) so the client-side guard genuinely re-runs on every load, and swaps the
sidebar-collapse-state loader from a server-fn round-trip to a direct client cookie read (now that
the route no longer server-renders). See Problem/Decision below for full detail.

## Problem

`apps/admin/src/routes/(dashboard)/route.tsx`'s `beforeLoad` guard contains:
```ts
if (typeof document === 'undefined') return; // SSR: defer to client + server guard.
```
With TanStack Start's default `ssr: true`, the server resolves `beforeLoad` to a no-op and renders
the dashboard shell; hydration REUSES that resolved match instead of re-running the guard. Result:
a hard page load / direct URL / refresh by a logged-out user renders the full dashboard chrome
before any redirect happens. Only client-side navigation is actually guarded today.

**Not a data leak.** `packages/api/src/index.ts:254` mounts `requireAdmin(auth)` on `/api/admin`
for every sub-router; no `/api/admin/*` data is reachable without a valid admin/super_admin
session. No route loader in `apps/admin` fetches business data during SSR — every screen is
client-side react-query. The SSR HTML is empty chrome only (sidebar labels, nav placeholders).
This is a UX/correctness bug (wrong shell renders), not a security bug.

## Decision (locked — no alternatives considered)

Set `ssr: false` on the `(dashboard)` route and delete the `typeof document === 'undefined'`
early-return, keeping the existing client-side `fetch('${env.apiUrl}/api/admin/me', {credentials:
'include'})` check and its redirect-to-`/login` on non-OK.

**Why this and not a server-side check:** the better-auth session cookie is set by the API origin
(a different host/port than the admin app in this repo's topology). The admin app's own SSR page
request never carries that cookie, so no server-side check can work without a same-origin/reverse-
proxy change (see the backlog note filed alongside this plan). `requireAdmin` on the API remains
the actual security boundary; this guard is UX/correctness only — do not "fix" this back to a
server-side check without first landing that infra change.

**Why `ssr: false` over an ad-hoc branch:** TanStack Start's Selective SSR model states that with
`ssr: false`, `beforeLoad` runs on the client during hydration — i.e. it genuinely executes on
every load, it does not reuse a server-resolved result. This is the framework's first-class
mechanism for "this route must always client-verify"; a `typeof document` branch is the pattern
TanStack explicitly discourages, and a component-level `useEffect` re-check would reintroduce a
flash-of-protected-content window this fix is meant to close.

**VALIDATE-confirmed (verified against installed `@tanstack/react-router@1.170.18` /
`@tanstack/router-core@1.171.15` source, not docs alone):**
- `load-matches.js`'s `isBeforeLoadSsr` resolves each match's `ssr` flag; the very first check is
  `if (parentMatch?.ssr === false) { existingMatch.ssr = false; return; }` — an unconditional,
  non-overridable cascade. This means every existing child route under `(dashboard)` (`branches`,
  `orders`, `products`, `deals`, `offers`, `promotions`, `categories`, `rewards`, `analytics`,
  `components`, and their `.index`/`.$id` sub-routes — confirmed present in
  `routeTree.gen.ts`) automatically inherits `ssr:false` too, without needing its own `ssr` option
  set. The fix protects the whole dashboard route family, not just the layout shell.
- `Match.js`'s `MatchView` wraps any match whose resolved `ssr === false` in
  `<ClientOnly fallback={pendingElement}>` (no `pendingComponent` is configured anywhere in this
  app, so `pendingElement` is `null`). This means the server renders **nothing** for the entire
  `(dashboard)` subtree when `ssr:false` is set — not a stale/no-op shell, but a genuinely empty
  boundary. `ClientOnly`'s `useHydrated()` uses `useSyncExternalStore` with a `getServerSnapshot`
  that returns `false` (matching the client's own pre-hydration render) — this is React's
  documented SSR-safe idiom, so there is no hydration-mismatch warning risk.
- `load-matches.js`'s `shouldSkipLoader` skips `beforeLoad`/`loader` execution only when
  `match._nonReactive.dehydrated` is true (client) or `match.ssr === false` (server). Once
  `ssr:false` resolves, the server never dehydrates this match (`ssr-client.js`:
  `dehydrated = match.ssr !== false`), so on the client `dehydrated` is `false` and `beforeLoad`
  genuinely re-executes during hydration — this closes the guard hole exactly as designed.

**Second-order effect this confirmation surfaces (accepted trade-off, not a defect):** because the
entire `(dashboard)` subtree renders nothing server-side and no `pendingComponent`/
`defaultPendingComponent` exists anywhere in `apps/admin` today, every dashboard route (not just
this layout) will show a blank white screen on every hard load until the client-side
`/api/admin/me` round-trip resolves, then either redirects or paints. Previously the (buggy) shell
painted instantly. This is an accepted UX trade-off of closing the guard hole correctly — adding a
loading skeleton is out of scope for this plan (no design decision needed for a bug fix); the 3
Agent-Probe scenarios below should treat a brief blank flash before paint as expected, not a
regression, and this should be called out explicitly in the phase report so it isn't mistaken for
new breakage during the manual walkthrough.

**Why `ssr: false` over an ad-hoc branch (cont.):** see confirmation above — this is the
framework's designed behavior, not an assumption.

## Known wrinkle: the `getSidebarState` loader

`(dashboard)/route.tsx` also has `loader: () => getSidebarState()`, a `createServerFn` reading the
`sidebar_state` cookie server-side via `getCookie` (from `@tanstack/react-start/server`) — added
specifically to avoid sidebar-collapse FOUC/hydration mismatch under SSR.

Under `ssr: false` this loader executes client-side. Calling a `createServerFn` from the client is
an RPC round-trip (an extra network request before the sidebar can paint its correct state).

**Decision: switch to reading `sidebar_state` directly from `document.cookie` in the loader (no
server fn, no RPC round-trip).** Rationale: the original hydration-mismatch concern that motivated
the server-side read only applies when the SAME route also server-renders — once `(dashboard)` no
longer SSRs at all, there is no server-rendered HTML to mismatch against; the client loader runs
once, synchronously, before the sidebar mounts. This is simpler than keeping the RPC (no server
round-trip, no `createServerFn` import needed on this route) and does not regress behavior.
**VALIDATE-confirmed:** the sidebar's `sidebar_state` cookie is written via a plain
`document.cookie = ...` assignment in `apps/admin/src/components/ui/sidebar.tsx` (not
`HttpOnly`), so it is genuinely readable from client JS; no server-only cookie-access
requirement blocks this swap.

`getCookie` (server) reads via Node request headers; the client equivalent is a small inline parse
of `document.cookie` for the `sidebar_state` key. No new dependency required.

## Touchpoints

- `apps/admin/src/routes/(dashboard)/route.tsx` — the only file changed:
  - `export const Route = createFileRoute('/(dashboard)')({ ssr: false, ... })`
  - delete `if (typeof document === 'undefined') return;` from `beforeLoad`
  - replace `loader: () => getSidebarState()` with a client-side `document.cookie` read (function
    can stay in this file, no server fn); remove the now-unused `createServerFn`/`getCookie`
    imports if nothing else in the file needs them
  - update the two doc comments above `getSidebarState`/`beforeLoad` to describe the new SSR-off
    behavior (they currently describe the SSR-on/deferred model this fix replaces)
- `apps/admin/src/routes/(dashboard)/-route.test.tsx` (new, **leading `-` required** — see
  VALIDATE note below; matches the established `-index.test.tsx` precedent) — first automated
  test for this guard

No other files change. Nothing in `packages/api` is touched (server guard is already correct and
out of scope per the task instruction).

**VALIDATE note on the test file name:** `process/context/tests/all-tests.md` documents that any
test file placed directly inside `apps/admin/src/routes/` must use a leading `-` (e.g.
`-index.test.tsx`, renamed during Phase 1 UPDATE PROCESS) so TanStack Start's file-based route
generator ignores it. Confirmed: `apps/admin/vite.config.ts`'s `tanstackStart()` plugin call has no
`routeFileIgnorePrefix` override, so the default (`-`) applies. A file named `route.test.tsx`
(no leading dash) inside `(dashboard)/` would be swept into route generation like any other `.tsx`
file in that directory, risking a bogus generated route entry or a `build` gate failure. **Name it
`-route.test.tsx`, not `route.test.tsx`.**

## Public Contracts

None changed. `GET /api/admin/me` contract (200 `{role}` / 403) is unchanged and untouched. No new
route, no new prop, no new exported function signature — this is an internal route-config flip
plus an internal loader implementation swap. The `(dashboard)` layout's child-route contract
(render `<Outlet/>`, wrap in `SidebarProvider`) is unchanged.

## Blast Radius

- 1 file modified (`(dashboard)/route.tsx`), 1 file added (its new test, named `-route.test.tsx`)
- Package: `apps/admin` only
- Risk class: none of auth/billing/schema/migration/public-API/container-proxy/secrets apply —
  this changes client-side routing/rendering behavior only, no server trust boundary moves
- No dependency, agent, or runtime surface added
- Well within QUICK-FIX-scale bound, but plan is written anyway per the task's explicit request

## Implementation Checklist

1. In `apps/admin/src/routes/(dashboard)/route.tsx`, add `ssr: false` to the `createFileRoute`
   options object passed to `Route`.
2. Delete the line `if (typeof document === 'undefined') return; // SSR: defer to client + server guard.`
   from inside `beforeLoad`. The rest of the `beforeLoad` body (fetch `/api/admin/me`, redirect on
   throw/non-OK) is unchanged.
3. Replace the `getSidebarState` `createServerFn` with a plain client-side helper, e.g.:
   ```ts
   function readSidebarState(): boolean {
     if (typeof document === 'undefined') return true; // non-browser eval guard only
     const match = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/);
     return match?.[1] !== 'false';
   }
   ```
   Keep the exact same fallback semantics as today: absent/invalid cookie → open (`true`); only an
   explicit `'false'` closes. Rename `loader: () => getSidebarState()` → `loader: () =>
   readSidebarState()`.
4. Remove the now-unused `createServerFn` (`@tanstack/react-start`) and `getCookie`
   (`@tanstack/react-start/server`) imports from the top of the file if nothing else references
   them (confirm via a grep for both symbols in this file before removing).
5. Update the doc comment above the old `getSidebarState` (now `readSidebarState`) to describe the
   client-side-cookie-read rationale (see "Known wrinkle" above) instead of the SSR-server-read
   rationale it currently documents.
6. Update the doc comment above `beforeLoad`/`Route` to state plainly: this route has `ssr: false`
   so `beforeLoad` runs on every load (including hard refresh), closing the SSR-skip gap; drop the
   stale "skipped during SSR" sentence.
7. Add `apps/admin/src/routes/(dashboard)/-route.test.tsx` (leading `-` — see Touchpoints/VALIDATE
   note above) — see Verification Evidence below for exact scenarios; import `Route` from
   `./route` and invoke `Route.options.beforeLoad()` directly (zero-arg call — no router test
   harness needed, confirmed mechanically feasible in VALIDATE, see Test Gates); mock `fetch` to
   return a 403 response and assert the call throws a redirect (a `Response` instance whose
   `.options.to === '/login'`, or use `isRedirect()` from `@tanstack/react-router`); a second case
   mocks a 200 response and asserts no redirect is thrown.
8. Run the 4 automated verification gates (below) and fix any typecheck/test/build/format failures
   introduced by the edit.
9. Leave an Agent-Probe note in the plan's Verification Evidence table for the manual hard-refresh
   checks the user will run (this cannot be automated in jsdom — no real browser navigation/SSR
   round-trip).

## Acceptance Criteria

1. `(dashboard)` route config has `ssr: false`; the `typeof document === 'undefined'` early-return
   is removed from `beforeLoad`.
2. `beforeLoad` still calls `GET /api/admin/me` with `credentials: 'include'` and redirects to
   `/login` on any non-OK response or fetch failure — unchanged behavior, now actually reachable
   on every load (not skipped during SSR).
3. `readSidebarState()` (client `document.cookie` read) preserves the exact same fallback
   semantics as the old `getSidebarState` server-fn: missing/invalid cookie → `true` (open); only
   an explicit `'false'` value → `false` (closed).
4. New `-route.test.tsx` covers: 403 → redirect; 200 → no redirect; cookie-fallback cases for
   `readSidebarState`.
5. `typecheck`, `test`, `build`, and `format:check` all pass for `apps/admin`.
6. Agent-Probe (user-run): hard-refresh while logged out redirects to `/login` with no dashboard
   chrome flash (a brief blank/white flash before redirect is expected and NOT a regression — see
   the second-order-effect note above); hard-refresh while logged in as admin/super_admin renders
   normally after a brief blank flash; sidebar collapse state survives a hard refresh.

## Phase Completion Rules

- This is a SIMPLE single-phase plan — no phase program, no umbrella.
- Code-complete (all 4 automated gates green) is `CODE DONE`, not `VERIFIED`.
- `VERIFIED` requires the 3 Agent-Probe scenarios above to be confirmed by the user (per standing
  convention: the user runs `apps/admin` UI walkthroughs manually — do not attempt to automate
  them with a headless browser tool).
- Archive to `process/features/admin-dashboard/completed/` only after `VERIFIED`.

## Test Infra Improvement Notes

(none identified yet)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/admin typecheck` | Fully-Automated | No type regressions from the `ssr:false` flip and loader rewrite |
| `pnpm --filter @jojopotato/admin test` (new `-route.test.tsx`: `beforeLoad` redirects to `/login` when `/api/admin/me` returns 403; `beforeLoad` does not redirect when it returns 200) | Fully-Automated | proven by: guard actually rejects/allows based on server response — the core logic under test, independent of SSR/CSR timing |
| `pnpm --filter @jojopotato/admin test` (new case: `readSidebarState` returns `true` on missing cookie, `true` on non-`'false'` value, `false` on `'false'`) | Fully-Automated | proven by: sidebar-state fallback semantics preserved after the server-fn → client-read swap |
| `pnpm --filter @jojopotato/admin build` | Fully-Automated | Route tree regenerates cleanly with the new `ssr: false` route option and the correctly-named (`-`-prefixed) test file; no build-time regression |
| `pnpm format:check` | Fully-Automated | Formatting clean before commit, per repo commit-hygiene rule |
| Agent-Probe: hard-load (full page refresh, not client nav) a `(dashboard)` URL while logged out → redirects to `/login`; a brief blank/white flash before redirect is expected (no dashboard chrome flash) | Agent-Probe | proven by: real-browser SSR+hydration behavior — cannot be reproduced in jsdom (no real network round-trip / no server-rendered HTML to inspect); user runs this manually per standing convention (`user-verifies-ui-manually` memory) |
| Agent-Probe: hard-load a `(dashboard)` URL while logged in as admin/super_admin → dashboard renders normally after a brief blank flash, no unexpected redirect | Agent-Probe | proven by: same real-browser SSR/hydration constraint as above |
| Agent-Probe: toggle sidebar collapse, hard-refresh → collapse state persists (no visible flash from open→closed or vice versa) | Agent-Probe | proven by: `readSidebarState`'s cookie-parse correctness under a real browser reload, which jsdom's fake `document.cookie` cannot fully stand in for across a real navigation |

**Honest tier note:** the actual "does the redirect really happen before paint on hard refresh"
behavior needs a real browser (TanStack Start dev/prod server + real network) — this is Agent-Probe
per the standing project convention that the user runs `apps/admin` UI walkthroughs manually (no
Playwright/E2E runner exists for this app). The Fully-Automated tests above prove the underlying
logic (fetch → redirect decision, cookie-parse fallback) in isolation; they do NOT prove the SSR
timing fix end-to-end. This gap is inherent to the `apps/admin` test-runner maturity, not new debt
from this plan — do not attempt to fake it with a jsdom-only "SSR" assertion.

## Resume and Execution Handoff

1. Selected plan file path: `process/features/admin-dashboard/active/adm-route-guard-ssr_20-07-26/adm-route-guard-ssr_PLAN_20-07-26.md`
2. Last completed phase or step: VALIDATE (this document) — SPEC/INNOVATE explicitly skipped, see header
3. Validate-contract status: PASS — see `## Validate Contract` below
4. Supporting context files loaded: `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`
5. Next step for a fresh agent picking up mid-execution: `ENTER EXECUTE MODE` for this exact plan path, implement Checklist items 1-9 (note the `-route.test.tsx` filename fix applied during VALIDATE), run the 4 automated gates, then hand the 3 Agent-Probe scenarios to the user per standing convention (do not attempt to drive them via a headless browser tool)

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 0/7 signals present (single file, `apps/admin` only, no schema/auth/API/billing
surface, no new dependency/agent/runtime surface, no 3+ directions) — sequential single-pass
VALIDATE is correct; fan-out into parallel dimension/section agents was performed as a single
sequential reasoning pass by the validate-agent itself given the small, self-contained scope
(all 4 Layer 1 dimensions + the 2 Layer 2 sections below were evaluated directly, not via
subagent spawn, per the sequential recommendation).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1/AC2 | `beforeLoad` genuinely re-runs on every load and redirects to `/login` on 403/fetch-failure, allows on 200 | Fully-Automated | `pnpm --filter @jojopotato/admin test` — `-route.test.tsx`: mock `fetch` 403 → assert thrown redirect (`isRedirect(err)` / `err.options.to === '/login'`); mock 200 → assert no throw | A |
| AC3 | `readSidebarState()` preserves exact fallback semantics of the old server-fn (missing/invalid → open, only `'false'` → closed) | Fully-Automated | `pnpm --filter @jojopotato/admin test` — `-route.test.tsx`: 3 cases (no cookie → true, `'true'`/garbage → true, `'false'` → false) | A |
| AC1 (type safety) | No type regressions from `ssr:false` + loader rewrite | Fully-Automated | `pnpm --filter @jojopotato/admin typecheck` | A |
| AC4 (build) | Route tree regenerates cleanly; correctly-named test file does not pollute the generated route tree | Fully-Automated | `pnpm --filter @jojopotato/admin build` | A |
| — | Formatting clean before commit | Fully-Automated | `pnpm format:check` | A |
| AC6a | Hard-load while logged out redirects to `/login`; blank flash before redirect is expected, not a regression | Agent-Probe | User-run manual walkthrough: hard-refresh a `(dashboard)` URL while logged out | A (user-run this session, post-EXECUTE) |
| AC6b | Hard-load while logged in as admin/super_admin renders normally after a brief blank flash | Agent-Probe | User-run manual walkthrough: hard-refresh while authenticated | A (user-run this session, post-EXECUTE) |
| AC6c | Sidebar collapse state persists across a hard refresh | Agent-Probe | User-run manual walkthrough: toggle sidebar, hard-refresh | A (user-run this session, post-EXECUTE) |

gap-resolution legend:
- A — proven now (gate passes in this cycle) / scheduled to run in this same EXECUTE cycle
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- `(dashboard)` guard logic: Fully-automated: `pnpm --filter @jojopotato/admin test` (new `-route.test.tsx`) | Agent-probe: user-run hard-refresh walkthrough (logged-out redirect, logged-in render, sidebar persistence) | known-gap: none

Failing stub (AC1/AC2 — beforeLoad redirect/allow):
```
test("should redirect to /login when GET /api/admin/me returns 403", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: beforeLoad redirects on 403")
})
test("should not redirect when GET /api/admin/me returns 200", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: beforeLoad allows on 200")
})
```

Failing stub (AC3 — readSidebarState fallback semantics):
```
test("should return true when sidebar_state cookie is missing", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: readSidebarState missing-cookie fallback")
})
test("should return false only when sidebar_state cookie is exactly 'false'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: readSidebarState explicit-false")
})
```

Dimension findings:
- Infra fit: PASS — single `apps/admin` file change, no container/infra/port surface; `ssr:false`
  is a first-class, version-confirmed option in the installed `@tanstack/react-router@1.170.18` /
  `@tanstack/router-core@1.171.15` (verified against installed source, not docs).
- Test coverage: CONCERN (resolved in-plan) — the plan originally named the new test file
  `route.test.tsx` (no leading `-`), which would be swept into TanStack Start's file-based route
  generator (default `routeFileIgnorePrefix: '-'`, no override in `vite.config.ts`), risking the
  `build` gate. Fixed in-plan: renamed to `-route.test.tsx` throughout (Touchpoints, Checklist
  item 7, Verification Evidence), matching the established `-index.test.tsx` precedent documented
  in `all-tests.md`.
- Breaking changes: PASS — no public contract changes; confirmed via grep that no other file
  imports anything from `(dashboard)/route.tsx`.
- Security surface: PASS — no new trust boundary; server-side `requireAdmin` gate on `/api/admin`
  independently confirmed present (`packages/api/src/index.ts:254`) and unaffected by this change.
  This plan closes a UX/correctness gap layered on top of an already-sound security boundary,
  matching the plan's own framing (not overclaimed).
- Section A feasibility (Route Guard Fix, Checklist 1-6): PASS — mechanical feasibility confirmed
  (all edit-target strings present and uniquely matchable via direct file read); no gaps or
  conflicts found; the `ssr:false` cascade-to-children behavior and the `ClientOnly`/Suspense
  no-SSR-render mechanism were verified against installed router-core source, resolving the two
  highest-risk assumptions in the plan (SSR inheritance to child routes, and no
  flash-of-protected-content / no hydration-mismatch-warning under `ssr:false`) with concrete,
  version-specific evidence rather than docs alone.
- Section B feasibility (Test file, Checklist 7): CONCERN (resolved in-plan) — see Test coverage
  above for the naming-convention finding and its fix. Additionally verified: `createFileRoute(path)(options)`
  is a plain factory with no dependency on route-tree registration, and `redirect()` returns/throws
  a plain `Response` object with no Router-instance dependency — so calling
  `Route.options.beforeLoad()` directly in a vitest/jsdom test, with a mocked global `fetch`, is
  fully mechanically feasible with zero router test harness. This resolves the plan's own stated
  open question about test feasibility (Checklist item 7) in favor of the plan's chosen approach.

Open gaps: none unresolved. Two CONCERNs found during VALIDATE (test-file naming; the second-order
initial-paint blank-flash effect) were both resolved by direct plan-text updates during this V6
pass (see Dimension findings above and the new VALIDATE-confirmed paragraphs in Decision/Known
wrinkle) — no code changes were required to resolve either.

What this coverage does NOT prove:
- The Fully-Automated `beforeLoad`/`readSidebarState` tests prove the underlying decision logic
  (fetch → redirect/allow; cookie-parse fallback) in isolation. They do NOT prove the actual SSR
  timing fix end-to-end — i.e. that a real hard-refresh in a real browser genuinely skips
  server-rendering the dashboard chrome and redirects before paint. That requires a real
  TanStack Start server + real browser navigation, which jsdom cannot simulate (no real
  network round-trip, no real server-rendered HTML). This is covered by the 3 Agent-Probe rows
  and is a standing, project-wide `apps/admin` test-runner maturity gap (no Playwright/E2E
  runner), not new debt introduced by this plan.
- The `build` gate proves the route tree regenerates without error; it does not prove the
  generated bundle behaves correctly at runtime (covered by Agent-Probe instead).
- No automated gate proves the accepted blank-flash trade-off is visually acceptable to a human —
  this is inherently a judgment call, covered by the Agent-Probe rows (AC6a/AC6b), which now
  explicitly instruct the user that a brief blank flash is expected, not a regression.

Gate: PASS (no FAILs, plan updated — both CONCERNs found during VALIDATE were resolved via direct
plan-text edits in this same pass: the test-file naming-convention fix and the blank-flash
second-order-effect documentation)
Accepted by: N/A — Gate is PASS; both VALIDATE-found CONCERNs (test-file naming, blank-flash
second-order effect) were resolved via direct plan-text edits during this V6 pass rather than
accepted as outstanding residuals, so there is no CONDITIONAL concern list requiring acceptance.

## Autonomous Goal Block

SESSION GOAL: Fix the `apps/admin` `(dashboard)` route SSR auth-guard hole (hard-refresh /
direct-URL load bypasses the client `beforeLoad` check) by setting `ssr: false` and swapping the
sidebar-state loader to a client cookie read.
Charter + umbrella plan: N/A — single standalone SIMPLE plan, no phase program.
Autonomy: Standard RIPER-5 gates apply (no standing /goal for this task). EXECUTE requires
explicit "ENTER EXECUTE MODE"; the 3 Agent-Probe scenarios are always user-run (never automated
via headless browser), per standing `apps/admin` convention.
Hard stop conditions / safety constraints:
- Do not touch `packages/api` — the server-side `requireAdmin` guard is already correct and is
  explicitly out of scope for this plan.
- Do not "fix" this back to a server-side cookie check — the better-auth session cookie is set by
  a different origin than the admin app's own SSR request; a same-origin/reverse-proxy change
  (tracked in `process/features/admin-dashboard/backlog/admin-api-same-origin-reverse-proxy_NOTE_20-07-26.md`)
  is a prerequisite for that and is not part of this plan.
- Name the new test file `-route.test.tsx` (leading dash) — a plain `route.test.tsx` inside
  `apps/admin/src/routes/(dashboard)/` would be swept into the TanStack Start route generator.
Next phase: EXECUTE — `ENTER EXECUTE MODE` for this exact plan path.
Validate contract: inline in this plan file (`## Validate Contract`, Gate: PASS).
Execute start: `pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin build && pnpm format:check` | Agent-Probe: 3 hard-refresh scenarios (logged-out redirect, logged-in render, sidebar persistence) — user-run only | high-risk pack: no (no auth/billing/schema/public-API/container/secrets surface touched)
