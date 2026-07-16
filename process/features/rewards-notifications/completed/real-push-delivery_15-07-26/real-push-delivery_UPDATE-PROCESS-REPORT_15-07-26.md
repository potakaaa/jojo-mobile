---
phase: real-push-delivery-update-process
date: 2026-07-15
status: COMPLETE_WITH_GAPS
feature: rewards-notifications
plan: process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md
---

# UPDATE PROCESS Report — Real Device Push Delivery (iOS + Android)

**TL;DR:** Plan reconciled cleanly against implementation — zero deviations, confirmed
independently by EVL (167/167 API, 13/13 mobile, all typecheck/lint green). `all-context.md`
updated with a new dense bullet (also backfilling the never-documented PUSH-004 baseline). Plan
is **NOT archived**: the plan's own Phase Completion Rules require user review of the AC-5
credential runbook before "VERIFIED," and AC-5's only coverage is Agent-Probe (document review) —
per the archival vacuous-green gate, this forces "keep active/testing," not "ready to archive."

## What Was Done

- Read the plan (`real-push-delivery_PLAN_15-07-26.md`), the execute-agent report
  (`real-push-delivery_REPORT_15-07-26.md`), `results.tsv` (PVL cycle 0 CONDITIONAL → cycle 1
  supplement → cycle 2 PASS), and the credential runbook
  (`real-push-delivery_REF-credential-runbook_15-07-26.md`, 180 lines, present).
- Reconciled plan vs. implementation: all 12 checklist items + Execute-Agent Instructions E1–E5
  implemented as written. Execute-agent's self-review claims "Plan Deviations: None" — confirmed
  against the independent EVL handoff summary (gates_green matches; no CONTEXT_PARTIAL flags; no
  follow-up stubs beyond the already-filed backlog note).
- Updated `process/context/all-context.md`:
  - Added a new dense bullet documenting PUSH-004's baseline (never previously captured in this
    file — a pre-existing gap, backfilled here) plus the `real-push-delivery_15-07-26` hardening
    follow-up: platform Zod-enum tightening, background/killed-app payload shaping, the
    `sendAndPrune` prune seam living in `notification-dispatch.ts` (not `push-provider.ts`), the
    ticket/token correlation gotcha (filtered+chunked order, not the raw `tokens` array), and the
    `app.config.ts` background-mode plugin change.
  - Documented both accepted Known-Gaps (receipt-stage token pruning — backlog note filed; AC-6
    real-hardware delivery — permanent user-run Agent-Probe).
  - Explicitly noted the plan is CODE DONE but not VERIFIED/archived yet, and why.
  - Bumped the file's "Last updated" line and Scan Metadata delta footer (new "Last delta" entry;
    prior entries shifted down one label, chain otherwise intact).
- Confirmed `process/context/tests/all-tests.md` needs **no edit** — `push-provider.test.ts`'s
  mixed mocked-unit + real-DB-seeded-fixture pattern mirrors the already-documented
  `push-provider.integration.test.ts` hermetic pattern; not a new runner, not a new gap.
- Confirmed the feature list in `CLAUDE.md`/`AGENTS.md` is already in sync
  (`rewards-notifications` already listed; `ls process/features/` matches).
- Confirmed the backlog note (`receipt-stage-token-prune_NOTE_15-07-26.md`) is well-formed,
  correctly located, and has proper frontmatter — no action needed.
- Ran `validate-context-discovery.mjs` before and after the edit (via `git stash`/`git stash pop`)
  to confirm the reported failures (missing `.agents/skills/*` symlinks, stale GENERATED:routing
  block) are pre-existing environment issues, not caused by this session's edits — identical
  failure set both with and without the `all-context.md` change staged.

## What Was Skipped / Deferred

- **Plan archival.** Blocked by the archival vacuous-green gate: AC-5 (credential runbook review)
  is an Agent-Probe-only criterion with no automated/E2E proof possible — its only coverage is
  "user reviews the doc." Per `10-update-process.md` §Archival gate, any criterion resting on an
  Agent-Probe-only residual forces "keep active because testing/user confirmation is still
  pending," not "ready to archive now." This matches the plan's own explicit
  `## Phase Completion Rules`: "VERIFIED only after the user has reviewed the credential runbook
  doc (AC-5) — code-only completion without that review stays CODE DONE, not VERIFIED." → Backlog
  action: none needed (this isn't a fixable code gap, it's a pending human action already
  documented inside the runbook itself).
- **`vc-audit-vc` / `vc-audit-plans` full Tier-1 sweeps** — not run this pass. No `.claude/`,
  `.codex/`, agent, or skill files were touched this session (only a context doc), so the Tier-1
  trigger condition (harness/agent edits) for `vc-audit-vc` did not fire. `vc-audit-plans` was not
  run because no plan file was archived or moved this pass — nothing changed in plan inventory
  state to audit.
- **Regression validator suite (agent-parity, skill-registry, etc.)** — not run; out of scope,
  same reasoning (no harness/agent files touched).

## Test Gate Outcomes

Not re-run this session — this is process-only work (context doc edit). Relied on the EVL
handoff summary's independent confirmation (already re-run, not re-stated from execute-agent's own
claim):

| Gate | Result (from EVL handoff, trusted) |
|---|---|
| `db:migrate` | green |
| `pnpm --filter @jojopotato/api test` | 167/167 green |
| `pnpm --filter @jojopotato/mobile test` | 13/13 green |
| `pnpm --filter @jojopotato/api typecheck` | green |
| `pnpm --filter @jojopotato/api lint` | green |
| `pnpm --filter @jojopotato/mobile typecheck` | green |
| `pnpm --filter @jojopotato/mobile lint` | green (3 pre-existing unrelated warnings in `dev-with-tunnel.mjs`, not caused by this plan) |
| `node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs` | run this session — pre-existing failures unrelated to my edit (confirmed via stash/unstash A-B comparison); no NEW failures introduced |

## Plan Deviations

None. Execute-agent's self-review ("Plan Deviations: None") is confirmed by the independent EVL
run and by my own read of the diff-shape described in both the plan's Touchpoints table and the
execute-agent report's "What Was Done" table — they match 1:1.

## Test Infra Gaps Found

None new this pass. The plan's own "Test Infra Improvement Notes" section already documents the
one open item (receipt-stage vs ticket-stage `DeviceNotRegistered` detection), and it already has
a backlog note filed (`receipt-stage-token-prune_NOTE_15-07-26.md`) — no duplicate needed.

## SPEC Achievement

Scoring against the locked `real-push-delivery_SPEC_15-07-26.md` (7 SPEC-level ACs, 1:1 with the
plan's Acceptance Criteria):

| AC | Behavior | Gate | Verdict |
|---|---|---|---|
| AC-1 | Platform enum validation, 422 on invalid | Fully-Automated, green | **met** |
| AC-2 | Background/killed-app payload fields present | Fully-Automated, green | **met** |
| AC-3 | Permanent-error token pruning, transient untouched | Fully-Automated, green | **met** |
| AC-4 | `app.config.ts` background-mode plugin tuple, no secret file needed | Fully-Automated, green | **met** |
| AC-5 | Credential runbook doc exists, reviewed by user | Agent-Probe (doc review) — doc exists, review not yet performed | **unmet** — not a code gap; tracked by the plan's own Phase Completion Rules (VERIFIED gate), no separate backlog stub needed since it's a pending human action, not a fixable engineering gap |
| AC-6 | Real on-device delivery | Agent-Probe, permanent Known-Gap by SPEC design | **unmet** (by design — not archival-blocking on its own; SPEC explicitly scopes this as unautomatable and non-blocking for VERIFIED. AC-5 is the actual blocker for archival, not AC-6.) |
| AC-7 | Full API suite green, creds unset | Fully-Automated, green (167/167) | **met** |

5 of 7 met automatically; 2 unmet are both explicitly-scoped-as-manual by the SPEC itself (not
engineering gaps) and both already have their follow-up path documented (runbook for AC-5/AC-6;
receipt-stage note for the related deferred design decision). No new backlog NOTE needed beyond
the one already filed.

## Closeout Packet

1. **Selected plan path:** `process/features/rewards-notifications/active/real-push-delivery_15-07-26/real-push-delivery_PLAN_15-07-26.md`
2. **Closeout classification:** **Keep in active/testing** — CODE DONE, all automated gates green,
   but AC-5 (user review of the credential runbook) is Agent-Probe-only and unmet; the plan's own
   Phase Completion Rules gate VERIFIED status on that review. This is not "ready to archive."
3. **What was finished:** all 12 implementation-checklist items, all 5 Execute-Agent Instructions,
   the credential runbook doc, and the backlog note — confirmed via independent EVL re-run.
4. **Verified vs unverified:** AC-1/2/3/4/7 + regression + type/lint = automated-verified
   (independently re-confirmed by EVL, not just execute-agent's self-report). AC-5 = doc exists,
   awaiting user review. AC-6 = permanent user-run Known-Gap, not archival-blocking by SPEC design.
4b. **Validate-contract compliance:** present, inline in plan (`## Validate Contract`), Gate: PASS,
   PVL cycle 2, `generated-by: outer-pvl`, dated 15-07-26.
5. **Cleanup done vs still needed:** `all-context.md` updated (this session). Still needed: user
   review of the credential runbook, then re-run UPDATE PROCESS to archive.
6. **Single best next valid state:** Keep the plan active; once the user reviews
   `real-push-delivery_REF-credential-runbook_15-07-26.md` and confirms, re-enter UPDATE PROCESS
   MODE for this same plan to complete archival (move `real-push-delivery_15-07-26/` from
   `active/` to `completed/`).
7. **Commit-checkpoint recommendation:** **Execution commit recommended before archival-stage
   UPDATE PROCESS.** The code changes (packages/api, apps/mobile) are well-tested and
   independently EVL-confirmed green — recommend `vc-git-manager` for a single commit covering the
   `feat/push-notifications-api` branch's real-push-delivery diff (source + tests + migration +
   new runbook/backlog docs). The `all-context.md` process-doc edit from this session can ride in
   the same commit or a separate `process:` commit — either is acceptable since no further
   process-only changes are pending; recommend one combined commit for simplicity given the small
   diff surface, using this repo's `main`-direct commit policy per CLAUDE.md §Commit branch policy.
8. **Regression status:** not a phase program — N/A.
9. **SPEC achievement:** 5/7 automated-met; 2/7 unmet by explicit SPEC design (manual-only,
   non-engineering gaps), both already tracked (runbook + backlog note). See §SPEC Achievement
   above.

### Drift Signal Scoring

- (a) Files touched during EXECUTE: 20 files → +2 (≥1 and ≥10)
- (b1) `.claude/`/`.codex/`/agent harness files changed: none → +0
- (b2) `README.md`/`AGENTS.md`/`CLAUDE.md`/`process/development-protocols/` changed: none → +0
- (c) 3+ memory-worthy observations: yes (ticket/token correlation gotcha, `sendAndPrune` location,
  the never-before-documented PUSH-004 baseline gap) → +1
- (d) Feature-folder structural change: yes (new `real-push-delivery_15-07-26/` task folder,
  1 backlog NOTE written) → +1
- (e) Validate-contract deviation: none — execution matched the contract exactly → +0

**Score: 4 (HIGH band).** Strongly recommend UPDATE PROCESS -- harness/protocol files touched.
*(Note: the HIGH-band wording is the required verbatim phrase per the skill contract; in this
specific case the score crossed the HIGH threshold via files-touched + memory + structural signals,
not via harness/protocol file edits — no `.claude/`/`.codex`/protocol files were actually touched
this session, see (b1)/(b2) above.)*

## Forward Preview

### Test Infra Found
No new test infra this UPDATE PROCESS session (process-only). Execute-agent's report already
documents the new `push-provider.test.ts` reusable pattern.

### Blast Radius Changes
None beyond what execute-agent already reported (`sendPush` signature widening,
`POST /notifications/device-tokens` tightening). This session touched only
`process/context/all-context.md`.

### Commands to Stay Green
- `pnpm --filter @jojopotato/api test` (needs `docker compose up -d` or the native Postgres
  fallback documented in `tests/all-tests.md`)
- `pnpm --filter @jojopotato/mobile typecheck && pnpm --filter @jojopotato/mobile lint && pnpm --filter @jojopotato/mobile test`

### Dependency Changes
None.

## Regression Gate Validators

Not run — no `.claude/`, `.codex/`, agent, or protocol files were touched this session (only a
`process/context/` doc). Per orchestration.md §Regression Gate Validators, this suite runs "after
every phase that touches harness artifacts" — this phase did not. Ran
`validate-context-discovery.mjs` only (context-doc-specific check), confirmed pre-existing failures
unrelated to this change via A/B stash comparison.
