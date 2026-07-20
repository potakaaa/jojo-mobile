---
name: report:adm-route-guard-ssr
description: "UPDATE PROCESS reconciliation for the ADM dashboard SSR route-guard fix — CODE-COMPLETE + EVL-green, Agent-Probe walkthrough owed"
date: 20-07-26
metadata:
  node_type: memory
  type: report
  feature: admin-dashboard
  phase: n/a — single SIMPLE plan, no phase program
---

# ADM Route Guard SSR Fix — UPDATE PROCESS Report

**Plan:** `process/features/admin-dashboard/active/adm-route-guard-ssr_20-07-26/adm-route-guard-ssr_PLAN_20-07-26.md`
**Status:** CODE DONE, EVL-confirmed green. NOT VERIFIED — 3 Agent-Probe scenarios owed (user-run).
**Branch:** `refactor/small-fixes` (up to date with origin, working tree clean)

## What Was Done

Three commits landed this session, all already on disk and pushed before this UPDATE PROCESS pass began:

1. **`4929b27` — the planned fix (matches plan exactly).** `apps/admin/src/routes/(dashboard)/route.tsx`:
   added `ssr: false` to the route config, deleted the `typeof document === 'undefined'` early-return
   from `beforeLoad`, and replaced the `getSidebarState` `createServerFn` with a plain client
   `readSidebarState()` helper reading `document.cookie` directly. Added
   `apps/admin/src/routes/(dashboard)/-route.test.tsx` (leading `-`, 8 tests: 3 `beforeLoad`
   redirect/allow/fetch-failure cases, 1 credentials-included assertion, 4 `readSidebarState`
   fallback-semantics cases). Doc comments updated to describe the new SSR-off model.

2. **`75175b6` — branded loading state (unplanned, rode along).** `ssr: false` means the whole
   `(dashboard)` subtree server-renders nothing (`<ClientOnly fallback={pendingElement}>`, and no
   `pendingComponent` existed anywhere in the app), so every hard load showed a blank window while
   `beforeLoad` awaited the auth round-trip. Added a `pendingComponent` (`DashboardPending`): the
   real sidebar chrome (identical across all children, so it paints with zero shift) plus one
   `role="status"` activity indicator (a brand "J" tile replaying the design system's `:active`
   press) revealed only after a 160ms delay, so fast checks show no loader at all. Added one
   `@keyframes jojo-press` block + an `--animate-press` token to `globals.css` (Tailwind cannot
   express a two-property transform+shadow loop without keyframes); respects
   `prefers-reduced-motion` via `motion-reduce:animate-none` on the consuming element.

3. **`7b43d0e` — sidebar collapse UX (unplanned, rode along).** `SidebarTrigger` was `md:hidden`
   only, so desktop had no visible way to collapse the sidebar (only the undiscoverable
   Cmd/Ctrl+B shortcut). Switched to `collapsible="icon"`, moved the trigger into the sidebar
   header on desktop (mobile keeps its content-area trigger — offcanvas sheet makes an in-sheet
   trigger unreachable while closed, so the two visibility rules are exact complements), made the
   brand tile double as the expand control when collapsed (decorative/non-interactive when
   expanded), added tooltips on collapsed nav items and sign-out, and collapsed `nav-user.tsx`'s
   footer to its avatar at icon width.

## What Was Skipped/Deferred

- The same-origin reverse-proxy option that would let the guard validate server-side was
  deliberately NOT pursued — filed as backlog instead (see Fact C below). This is a topology/infra
  decision, not something this plan attempts.
- No content skeleton was added (the plan explicitly scoped a loading indicator as out of scope for
  the bug fix itself, then the loading-state commit landed anyway, unplanned — see Plan Deviations).

## Test Gate Outcomes

All 4 automated gates independently re-run this UPDATE PROCESS pass (not taken on the execute
session's word):

| Gate | Command | Result |
|---|---|---|
| typecheck | `pnpm --filter @jojopotato/admin typecheck` | PASS, 0 errors |
| test | `pnpm --filter @jojopotato/admin test` | PASS — 80/80 (16 test files) |
| build | `pnpm --filter @jojopotato/admin build` | PASS |
| format | `pnpm format:check` | PASS — all files clean |

## Plan Deviations

1. **`readSidebarState` swap was necessary, not preferential.** The plan already anticipated this
   (see plan's "Known wrinkle" section) but it's worth restating as a deviation-from-naive-approach:
   `createServerFn` genuinely throws when invoked from a client-only loader context (not merely a
   slower RPC as a first read might suggest) — the swap to a direct `document.cookie` read was the
   only working option under `ssr: false`, confirmed correct in code (`4929b27`).
2. **`globals.css` was touched — outside the plan's stated Blast Radius (1 file modified + 1 file
   added, `apps/admin` route file + test only).** This came from commit `75175b6` (branded loading
   state), which was not in the plan's checklist at all.
3. **The two follow-on commits (`75175b6` loading state, `7b43d0e` sidebar collapse UX) are entirely
   unplanned scope that rode along in the same session.** Neither is in the plan's Implementation
   Checklist, Touchpoints, or Blast Radius. The loading-state commit is a direct, reasonable
   consequence of the planned fix (the plan's own "Known wrinkle"/second-order-effect section
   predicted the blank-flash trade-off and explicitly said "adding a loading skeleton is out of
   scope for this plan" — commit `75175b6` did it anyway, closing a UX gap the plan had consciously
   deferred). The sidebar-collapse-control commit (`7b43d0e`) is unrelated to the SSR guard fix
   entirely — a pre-existing desktop UX gap (no visible way to collapse the sidebar) found and fixed
   in the same working session. Both are small, `apps/admin`-only, no schema/auth/API/billing
   surface, and both pass all 4 automated gates — but neither went through this plan's VALIDATE
   contract. Flagging honestly rather than silently treating them as pre-approved.

## Test Infra Gaps Found

- No new gaps. The existing, already-tracked `apps/admin` gap (no Playwright/E2E runner, so real
  browser SSR/hydration timing cannot be automated) is what makes AC6a/AC6b/AC6c Agent-Probe-only —
  this is inherent to `apps/admin`'s test-runner maturity, not new debt from this plan. Added one
  line to `process/context/tests/all-tests.md` making this specific limitation (jsdom cannot
  reproduce real SSR/hydration timing) explicit as a durable fact, since it will recur for any
  future `ssr:false` route.

## SPEC Achievement

No SPEC for this plan — the plan's own header states SPEC/INNOVATE were explicitly skipped ("bug
fix with a single locked approach... nothing left to spec or innovate"). Scoring against the plan's
own Acceptance Criteria instead:

| AC | Criterion | Status |
|---|---|---|
| AC1 | `ssr: false` set, early-return removed | MET — code-verified (`4929b27` diff) |
| AC2 | `beforeLoad` still calls `/api/admin/me` with credentials, redirects on non-OK | MET — automated test (`-route.test.tsx`) |
| AC3 | `readSidebarState()` preserves fallback semantics | MET — automated test (4 cases) |
| AC4 | 4 automated gates green | MET — independently re-confirmed this pass |
| AC5 | typecheck/test/build/format all pass | MET |
| AC6a-c | Agent-Probe hard-refresh scenarios | **UNMET/UNPROVEN** — not yet performed. No backlog stub needed: this is a plan-native, user-run gate already named in the plan's own Phase Completion Rules, not a gap requiring a new backlog note. |

## Closeout Packet

1. **Selected plan path:** `process/features/admin-dashboard/active/adm-route-guard-ssr_20-07-26/adm-route-guard-ssr_PLAN_20-07-26.md`
2. **Closeout classification:** Keep in active/testing — implementation is complete and all
   automated gates are green, but the plan's own Phase Completion Rules require the 3 Agent-Probe
   scenarios to be user-confirmed before `VERIFIED`, and archival is explicitly gated on `VERIFIED`.
3. **What was finished:** the SSR route-guard fix exactly as planned, plus 2 unplanned but working
   follow-on UI commits (loading state, sidebar collapse) — see What Was Done above.
4. **Verified vs unverified:** Verified — all 4 automated gates (typecheck/test/build/format),
   independently re-run this pass, all green; the guard's decision logic (fetch→redirect/allow,
   cookie-parse fallback) is proven in isolation by 8 real tests. Unverified — the actual SSR timing
   fix end-to-end (does a real hard-refresh in a real browser genuinely skip server-rendering and
   redirect before paint) cannot be automated (jsdom cannot simulate a real network round-trip or
   real server-rendered HTML) and has NOT yet been walked through by the user. The 2 follow-on
   commits also have no user-run visual confirmation yet.
4b. **Validate-contract compliance:** VALIDATE was run; `## Validate Contract` is present inline in
   the plan file, `generated-by: outer-pvl`, `Gate: PASS`, dated 20-07-26.
5. **Cleanup done vs still needed:** Done this pass — this report, plan status update, context
   updates (all-context.md delta, all-tests.md line), validator runs. Still needed — the user's
   3-scenario walkthrough, then archival to `completed/`.
6. **Single best next valid state:** Keep the plan active; the user runs the 3 Agent-Probe scenarios
   (logged-out hard-load → `/login`; logged-in hard-load → renders; sidebar collapse persists across
   reload). On confirmation, a follow-up UPDATE PROCESS pass moves the plan to `completed/`.
7. **Commit-checkpoint recommendation:** N/A — no execution commit pending; all 3 commits
   (`4929b27`, `75175b6`, `7b43d0e`) are already committed and pushed. This pass is doc-only
   (process/context updates), so its own commit belongs after this report and plan-status edit are
   accepted, as a separate `process(admin): ...` commit — consistent with the two-commit rule.
8. **Regression status:** N/A — not a phase program, no prior-phase overlapping surfaces to check
   against. The `9. SPEC achievement` gate above stands in for this item since there is no SPEC.

**Drift signal scoring:** (a) files touched: 2 files in the planned commit + 4 more across the 2
follow-on commits = ≥1 file → +1, not ≥10 → +0. (b1) no `.claude/`/`.codex`/agent harness files
touched → +0. (b2) no `README.md`/`AGENTS.md`/`CLAUDE.md`/`process/development-protocols/` files
touched → +0. (c) 3+ memory-worthy observations this session (Facts A-F, esp. C being critical) →
+1. (d) no new task folder/backlog-note/archival structural change from the EXECUTE work itself (the
backlog note was filed by the plan's own author during PLAN, not by this UPDATE PROCESS pass) → +0.
(e) no validate-contract deviation on the PLANNED scope (the 2 follow-on commits are additive,
outside-plan scope, not a deviation from the contract's own claims) → +0.

**Score: LOW (2 signals).** "UPDATE PROCESS available if you want." (This pass IS the UPDATE
PROCESS invocation — recorded for completeness per the required schema.)

## Durable Facts Captured

See `process/context/all-context.md` delta entry and the admin-dashboard implementation-state
bullet for Facts A-F in full. Summary of what got written where:

- **Fact C (server-side auth check is structurally impossible in the current topology)** — the most
  important fact from this session. Captured in `all-context.md`'s admin-dashboard bullet and
  cross-referenced to the backlog note `admin-api-same-origin-reverse-proxy_NOTE_20-07-26.md`
  (already filed by the plan's author during PLAN, confirmed present and accurate).
- **Fact A/B (TanStack Start `ssr:false` hydration-reuse behavior + cascade-to-children)** —
  captured as a compact routing/architecture note in `all-context.md`.
- **Fact E (`createServerFn` cannot run in a client loader — throws, not just slower)** — captured
  alongside Fact A/B.
- **Fact D (leading `-` test-file naming convention)** — already fully documented in
  `process/context/tests/all-tests.md` (lines 112-115, 166) from the Phase 1 precedent; no new edit
  needed, confirmed adequate.
- **Fact F (`ssr:false` + no `pendingComponent` = blank window)** — implicitly captured via the
  loading-state commit description in the all-context.md delta; not elevated to a standalone
  durable fact since it's specific to this one route family, not a repo-wide pattern.
- **New: jsdom cannot test real SSR/hydration timing** — added as one line to `all-tests.md`'s
  `apps/admin` paragraph, matching the existing pattern used for the CORS-discovery finding.

## Forward Preview

### Test Infra Found
None new — see Test Infra Gaps Found above.

### Blast Radius Changes
Plan declared: 1 file modified, 1 file added, `apps/admin` only. Actual: 2 files in the planned
commit (as declared) + 4 more files across 2 unplanned follow-on commits (`route.tsx` again,
`globals.css`, `app-sidebar.tsx`, `nav-user.tsx`) — all still `apps/admin` only, no cross-package
spread.

### Commands to Stay Green
```
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin build
pnpm format:check
```

### Dependency Changes
None. No new dependency was added by any of the 3 commits.
