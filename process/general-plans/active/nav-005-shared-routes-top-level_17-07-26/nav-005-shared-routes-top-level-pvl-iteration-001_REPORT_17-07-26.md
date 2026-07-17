---
name: report:nav-005-pvl-iteration-001
description: "PVL supplement cycle 1 for NAV-005 — 4 plan updates applied (mechanical gates + corrected real baselines); 2 structural CONCERNs remain and are accepted as known-gaps."
date: 17-07-26
metadata:
  node_type: memory
  type: report
  feature: none
  phase: PVL
---

# NAV-005 — PVL iteration 001

**Plan:** `./nav-005-shared-routes-top-level_PLAN_17-07-26.md`
**Cycle:** 1 | **Gate before:** CONDITIONAL (0 FAIL / 2 CONCERN) | **Gate after:** CONDITIONAL (0 FAIL / 2 CONCERN)
**Loop status:** HALTED_ACCEPTED

## SUPPLEMENT REQUEST (V7 first pass)

- Gap 1: Section `Test coverage` | Concern: AC1–AC5 have no automated tier — no RN E2E/navigation runner exists | Severity: CONCERN | Suggested addition: document as known-gap, cap exit status at CODE DONE
- Gap 2: Section `Breaking changes` | Concern: 7 route paths change; external/stored deep links to old paths would 404 | Severity: CONCERN | Suggested addition: enumerate in-app callers, verify notification pins, record residual

## Applied (4 updates, all in scope — no file-scope bright-line triggered)

| # | Change | Why |
|---|---|---|
| P1 | Added `grep -c "useHideTabBarWhile"` gate | Converts R1 (the `checkout.tsx` double-call) from review-caught to mechanically caught |
| P2 | Added 3-part codegen verification to step 23 | NAV-004 was burned by `expo start` silently skipping on an occupied port |
| P3 | Added `git diff` freeze check on the tab-bar files | AC8 was assertable but unasserted |
| P4 | Replaced brief-inherited baselines with real measured ones | `ui` is **71** not 68; mobile typecheck is **green** not RED (`all-tests.md` §Known Gaps is stale) |

## Not closed — accepted as known-gaps

Both remaining CONCERNs are **structural**, not plan-text defects. No supplement can close them:

- **Gap 1** — the repo has no RN E2E/navigation runner. This is a standing project-wide gap
  (`process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`), not something
  this plan introduces or can fix within its blast radius. Mitigation: exit status is capped at
  CODE DONE and AC1–AC5 are explicitly marked unprovable.
- **Gap 2** — changing a route path inherently invalidates old deep links. Mitigation: all 11
  in-app callers enumerated; `notification-factory.ts` verified to pin none of the 7; the same
  residual was accepted uneventfully in NAV-002 and NAV-004.

Further cycles would not change either. Halting at cycle 1 and accepting CONDITIONAL.

## Verdict

**Gate: CONDITIONAL — accepted.** 0 FAILs. Proceed to the mandatory pause with both gaps on record.
