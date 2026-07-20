---
phase: mobile-dark-mode-audit-sections-C-D-E
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: general-plans
plan: process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md
---

# Mobile Dark-Mode Audit — Sections C + D + E EXECUTE Report

**Scope of this report:** Sections C (fix each flagged site), D (StatusBar extraction + fix), and E
(tests + guard script) — the work that followed the A+B report's enumeration (98 defects / 36
files). This report is written retroactively at UPDATE PROCESS because the executing agent(s)
completed and committed this work but did not write it up before the session moved to closeout.
Reconstructed from `git log`/`git show --stat` (commits `6b36362`, `0ae8344`, `1ea1351`) and the
independent EVL confirmation row in `results.tsv` (`evl-1`) — not from memory.

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | general-plans |
| 2 | phase | EXECUTE (Sections C+D+E) |
| 3 | session-goal | Fix the mobile dark-mode rendering bug class + StatusBar legibility, with a durable automated guard against recurrence |
| 4 | branch | `spec/mobile-dark-mode-audit` |
| 5 | worktree | main (no separate worktree) |
| 6 | context-group | `tests` |
| 7 | blast-radius-packages | `packages/ui`, `apps/mobile` |
| 8 | active-plan | `process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md` |
| 9 | test-runner | `tsc --noEmit` \| jest (packages/ui) \| vitest + jest (apps/mobile) |
| 10 | validate-contract | inline in plan, `Gate: PASS`, `generated-by: outer-pvl`, `date: 2026-07-17` |

## What Was Done

### Section C — Fix Each Flagged Site (commit `6b36362`)

Threaded the screen's already-resolved theme mode into every call site the Section B enumeration
flagged, across 12 files (126 insertions / 55 deletions):

- `(staff)/branch-pickup-settings.tsx`, `(tabs)/index.tsx`, `component-showcase.tsx` (dev-only, 31
  of the 49 mobile errors — fixed anyway, not skipped, per Section C step 4), `features/home/
  components/{product-grid,promo-banner}.tsx`, `features/menu/components/{add-to-cart-bar,
  category-section,option-group-selector}.tsx`, `features/shared/components/screen-message.tsx`.
- **Three real dark-mode bugs fixed:**
  - `order/history.tsx:74` — the originally reported `<Card>` with no `mode`.
  - `order/history.tsx:93` — an `OrderStatusBadge` also missing `mode`, 19 lines below the known
    Card. Not predicted by the plan; found only because Section B's sweep is exhaustive by
    construction.
  - `order/cart.tsx:239` — the reorder-conflict `<Card>`.
- **Two sites classified "intentional fixed-mode candidate" (Section C step 2) and pinned
  `mode="light"` with an inline comment, not treated as bugs:**
  - `tracking/[orderId].tsx:96` — the `OrderStatusTimeline` sits on a hardcoded cream surface;
    comment at `:91` states its text must read the same fixed mode's tokens.
  - `features/home/components/promo-banner.tsx:35` — a permanently-yellow banner regardless of
    device scheme; comment at `:19` states the same rationale.
- `packages/ui`'s own 23 broken test fixtures (from the A+B enumeration) were fixed by adding
  `mode="dark"`/`mode="light"` to each render call — not itemized separately here; folded into the
  `packages/ui` typecheck/jest-green confirmation below.

Per-batch typecheck discipline (Section C step 3) is not independently re-verifiable after the fact
from git history alone — the final gate confirmation (EVL, below) is the authoritative evidence that
the full fix loop converged.

### Section D — StatusBar Extraction + Fix (commit `0ae8344`)

- New `apps/mobile/src/lib/status-bar.ts`: `resolveStatusBarStyle(appScheme) = appScheme === 'dark'
  ? 'light' : 'dark'` — the exact mapping LOCKED by the feasibility VERDICT (anti-inversion; an
  identity mapping would produce invisible icons in both themes). This is a scheme-**source** swap,
  not a logic change: `_layout.tsx:150` now reads the already-resolved app theme mode instead of the
  raw OS scheme via `style="auto"`, reusing the same `colorScheme` value already computed at `:96`
  (no second resolution call added).
- New `apps/mobile/src/lib/status-bar.test.ts` (vitest, pure-TS) — table-tests both directions of
  the mapping.
- No other line in `_layout.tsx` touched, per plan constraint.

### Section E — Tests + Guard Script (commit `1ea1351`)

- **`apps/mobile/scripts/check-theme-mode.mjs`** (new, 416 lines, wired as `pnpm --filter
  @jojopotato/mobile guard:theme-mode`): derives its 27 tracked component names from source (not
  hardcoded), hard-fails on any spread attribute (`{...props}`) on a tracked component's JSX call
  per the Gap 1 plan-supplement, bans raw RN `useColorScheme` imports outside the two
  `use-color-scheme.ts`/`.web.ts` wrapper files, and extends hex-literal checking into `apps/mobile`
  per the Gap 3 plan-supplement (closing the gap left by `packages/ui`'s pre-existing
  `check-raw-tokens.mjs`, which only ever covered `packages/ui/src/components/**`).
- **`apps/mobile/src/features/cart/__tests__/cart-dark-mode.test.tsx`** (new) and
  **`.../order/__tests__/history-screen-dark-mode.test.tsx`** (new) — both verified to fail against
  the pre-fix code before the fix landed (per the commit message: e.g. `Expected "#3a322c", Received
  "#FFF1CC"` — the light cream surface color — confirming the reported bug was real, not
  hypothetical, and that these tests assert RESOLVED style output, not prop-presence).
- **`apps/mobile/src/features/auth/__tests__/use-color-scheme-appearance.test.tsx`** (new, per Gap 2
  plan-supplement) — covers the resolved-preference hook via 5 resolver-precedence tests. **Known,
  accepted gap:** a genuine live-listener test (mocking `Appearance.addChangeListener` firing a
  simulated OS-theme-change event) was attempted and found infeasible — jest-expo stubs `Appearance`
  at two separate layers, so `useColorScheme()` never actually calls `addChangeListener` under the
  test harness, proven by 3 independent probes during this work. This is downgraded to Known-Gap per
  the plan's own instruction (Section E step 8) rather than left as an unwritten soft conditional;
  the live OS-resume flip remains Agent-Probe only.
- `runner-smoke.test.tsx` updated for the new required-`mode` component signatures.
- `packages/ui/src/components/__tests__/card.test.tsx` (pre-existing path, per A+B report Finding 3
  — the plan's "new file, zero coverage" premise was wrong) extended with mode-resolution
  assertions: `mode="dark"` vs `mode="light"` resolve to DIFFERENT `Colors.*.backgroundElement`
  values — a real mutation check, not prop-presence-only.

## What Was Skipped or Deferred

- **Section F (`all-tests.md` correction)** — not part of this EXECUTE spawn's scope; completed in
  this UPDATE PROCESS pass instead (see the context-file edits summarized below).
- **Live `Appearance` listener test** — genuinely attempted, found infeasible under jest-expo (see
  above), downgraded to Known-Gap per plan instruction, not silently dropped.
- **On-device Agent-Probe walkthroughs** (Android StatusBar 4-combination matrix, iOS StatusBar
  4-combination matrix as a SEPARATE walkthrough, app-restart persistence, OS-background-resume) —
  explicitly tiered Agent-Probe/Known-Gap by the plan itself; not performed by any agent (cannot be
  — requires physical/simulator hardware and a human). Recorded here and in the plan; **the plan
  cannot reach VERIFIED status until these are done** (see Archival Decision below).

## Test Gate Outcomes

All gates below were confirmed by an **independently spawned vc-tester** during the EVL confirmation
run (`results.tsv` row `evl-1`), not execute-agent self-report:

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/ui typecheck` | 0 errors |
| `pnpm --filter @jojopotato/mobile typecheck` | 0 errors |
| `pnpm --filter @jojopotato/ui test` (jest) | 65/65 passing |
| `pnpm --filter @jojopotato/mobile test` (vitest + jest) | 40/40 vitest + 37/37 jest passing |
| `pnpm --filter @jojopotato/ui check-tokens` | OK |
| `pnpm --filter @jojopotato/mobile guard:theme-mode` | OK — 27 components / 184 call sites / 0 violations |
| `pnpm format:check` | clean on the 4 files that failed pre-fix (`runner-smoke.test.tsx` + `packages/ui`'s addon-selector/branch-card/size-selector) — a formatting-hygiene issue found by the EVL run, not a contract gate, fixed via `prettier --write` before commit |

EVL-cited independent verification steps (per `results.tsv` `evl-1`, not repeated by this report
since they were already performed by the spawned tester): reverting `history.tsx:74` to
`mode="light"` reproduced the exact red (`Expected #3a322c, Received #FFF1CC`) then restored clean;
the guard script was proven to catch all 4 violation classes against a temp probe file; a diff scan
found zero test-weakening cheats (`as any`, `@ts-expect-error`, `eslint-disable`, `.skip`/`.only`);
the `useColorScheme` import ban was confirmed to hold (only the 2 wrapper files import raw RN
`useColorScheme`); the StatusBar mapping was confirmed inverted (not identity) and wired at
`_layout.tsx:150`.

## Plan Deviations

No deviations in Section C/D/E execution itself beyond the two already surfaced in the A+B report
(component count 27 not 26; `card.test.tsx` pre-existing not new). One new item found during this
UPDATE PROCESS reconstruction: the EVL run caught a `pnpm format:check` failure on 4 files that no
execute-agent had reported — a hygiene gap in self-reporting, not a code defect (see Test Gate
Outcomes table); fixed before commit.

## Test Infra Gaps Found

- **Live `Appearance`-listener behavior cannot be exercised under jest-expo** (see Section E above)
  — this is a durable, repo-wide test-infra limitation, not specific to this fix. Any future work
  needing to assert on OS-level theme-change events will hit the same stub. Recorded as a backlog
  note (see below).
- **`packages/ui/scripts/check-raw-tokens.mjs` still does not cover `apps/mobile`** as a *general*
  hex-literal guard — the new `guard:theme-mode` script covers `apps/mobile` for the mode/spread/
  import checks and was extended to also flag hex literals in touched files, but it is a distinct
  script from `check-tokens`, not a unification of the two. Two separate hex-guard scripts now exist
  (one per package) rather than one shared implementation — acceptable per the plan's own Gap 3
  resolution, noted here for future maintainers.

## SPEC Achievement

Scored against `mobile-dark-mode-audit_SPEC_17-07-26.md`'s 9 acceptance criteria (see the plan's own
Verification Evidence and Validate Contract test-gate tables for the authoritative mapping):

| AC | Criterion | Status |
|---|---|---|
| 1 | Order History renders correctly in dark mode | **met** — Fully-Automated tier green (`card.test.tsx` + history-screen dark-mode RTL test) |
| 2-4 | Tab roots / pushed screens / (auth)+(staff) render correctly in both themes | **met (Fully-Automated tier only)** — prop-wiring/no-crash RTL smoke tests green; the Hybrid/visual-confirmation tier is Agent-Probe-only, unmet automated, tracked as Known-Gap below |
| 5 | Android StatusBar legible, 4 combinations | **met (derivation-logic tier only)** — `status-bar.test.ts` green, mapping locked by feasibility probe; on-device pixel legibility is Agent-Probe/Known-Gap, unmet automated |
| 6 | Same for iOS (separate walkthrough) | **met (derivation-logic tier only)** — same split as AC5; on-device iOS walkthrough unmet automated, tracked separately per plan's own warning that Android does not transfer |
| 7 | Theme toggle updates all surfaces, persists across restart | **met (regression tier only)** — full suite green as regression guard on unchanged substrate; visual multi-surface update + restart-persistence claim is Agent-Probe, unmet automated |
| 8 | System-preference resume via `Appearance` listener | **unmet (automated tier) / Known-Gap** — live listener test genuinely attempted and found infeasible under jest-expo (3 probes); 5 resolver-precedence tests substitute; actual OS-resume is Agent-Probe only |
| 9 | No new raw `useColorScheme` import; no `mode`-taking call site missing `mode` without allow-listing; no new hardcoded colors | **met** — `tsc --noEmit` (both packages, 0 errors) + `guard:theme-mode` (0 violations) + `check-tokens` (OK) all green |

**Unmet criteria requiring backlog notes (per the vacuous-green ban — Known-Gap is never "met"):**
AC2-4's visual tier, AC5/AC6's on-device tier, AC7's visual/persistence tier, and AC8's live-listener
tier are each Agent-Probe residuals already explicitly tracked as Known-Gap in the plan itself
(Section E step 9, Validate Contract gap-resolution column `D`). These do not need new backlog
notes — the plan file IS the tracking artifact, and the plan is deliberately staying in `active/`
(see Archival Decision) specifically because these residuals are unresolved. Filing a duplicate
backlog note would fork the tracking source of truth.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md`
- **Finished:** Sections C, D, E — all in-scope Fully-Automated/Hybrid-automatable gates green,
  independently EVL-confirmed.
- **Verified:** all 6 contract gates green via a spawned vc-tester (not self-report); 5 load-bearing
  claims independently re-checked (see Test Gate Outcomes).
- **Still unverified:** Android + iOS on-device Agent-Probe walkthroughs, restart persistence,
  OS-background-resume — all explicitly Known-Gap by plan design, owed by the user.
- **Closeout classification:** **Keep in active/testing** — CODE DONE, not VERIFIED. See Archival
  Decision in the UPDATE PROCESS summary for the plan's own Phase Completion Rules and why this
  session does not archive it.

## Forward Preview

**Test Infra Found:** `guard:theme-mode` (new, `apps/mobile`) and `check-tokens` (pre-existing,
`packages/ui`) are now both documented in `process/context/tests/all-tests.md`'s Commands table.

**Blast Radius Changes:** matches the A+B report's Finding 2 — narrower than predicted for
production screens (11 files / 17 real errors), wider than predicted inside `packages/ui`'s own test
suite (23 files / 49 errors). Final touched-file count across C+D+E: 12 (`apps/mobile` screens/
components) + 2 new `status-bar.*` files + 1 new guard script + 4 new/extended test files +
`packages/ui`'s 23 fixed test fixtures + `card.test.tsx` extension.

**Commands to Stay Green:** `pnpm --filter @jojopotato/ui typecheck`, `pnpm --filter
@jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/ui test`, `pnpm --filter
@jojopotato/mobile test`, `pnpm --filter @jojopotato/ui check-tokens`, `pnpm --filter
@jojopotato/mobile guard:theme-mode`, `pnpm format:check`.

**Dependency Changes:** none. No new deps, no schema, no migration, no API surface.

## Follow-Up Stubs Created

None new. The Agent-Probe residuals are tracked in the plan file itself (Section E step 9, Validate
Contract gap-resolution `D`), not forked into a separate backlog note, to keep one source of truth
until the plan archives.

## CONTEXT_PARTIAL Items

None — all context needed for this reconstruction (git history, results.tsv, the plan's own
Validate Contract) was available and read directly, not assumed from memory.
