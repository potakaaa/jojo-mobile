---
name: backlog:api-test-db-concurrency-guard
description: "packages/api's vitest global-setup drops/recreates a fixed-name test database with no concurrency guard; concurrent local test runs (parallel agent sessions, parallel dev+CI) corrupt each other's gate evidence"
date: 17-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
---

# API test suite: no concurrency guard on the shared test-DB name

**Priority:** Medium — infra/tooling gap, not a product bug, but it directly weakens the
reliability of every EVL/EXECUTE gate run in this repo when more than one test run is in flight at
once.

**Problem:**

`packages/api`'s vitest global setup drops and recreates a Postgres database with a FIXED name
(the hermetic self-seeding test-DB pattern used across all integration suites) at the start of each
test run, with no lock, no per-invocation unique naming, and no concurrency guard. If two test runs
against the same local Postgres instance overlap — e.g. two agent sessions working in parallel, or
a developer running tests locally while an agent's background EVL run is also in flight — the
second run's setup can drop/recreate the DB out from under the first run's in-progress queries,
corrupting BOTH runs' results (spurious failures, or worse, a false-green run that never actually
exercised the code under test).

**Observed live, 17-07-26:** during the ADM-008 POST-MERGE FIX 6 (`adm-008-free-mechanics`) closing
pass, this collision was directly observed — parallel review/verification activity against the same
local Postgres instance required re-running the full API suite on a frozen tree (twice) to get a
trustworthy 411/411 result, because an earlier concurrent run's evidence was suspect.

**Root cause:** the hermetic self-seeding test-DB convention (documented in
`process/context/tests/all-tests.md`) was designed for a single-runner-at-a-time assumption that no
longer holds now that multiple agent sessions/CI runs can execute against the same local dev
Postgres concurrently.

**Fix options:**
1. Per-invocation unique DB name (e.g. suffix with PID or a random token), dropped only at the end
   of that specific run — removes the collision entirely, most robust, some setup/teardown rework.
2. A simple lockfile/mutex around the drop-recreate step so concurrent invocations queue instead of
   colliding — cheaper to implement, adds wall-clock time under contention.
3. Treat CI (which always runs against an isolated ephemeral Postgres service container) as the
   sole authoritative evidence source, and document that local concurrent runs are best-effort only
   — cheapest, but weakens local dev/agent confidence and doesn't fix the root collision.

**Recommendation:** option 1 (per-invocation unique DB name) is the most durable fix and should be
scoped as its own small infra plan when picked up — not a quick fix, since it touches the shared
global-setup file every integration suite depends on.
