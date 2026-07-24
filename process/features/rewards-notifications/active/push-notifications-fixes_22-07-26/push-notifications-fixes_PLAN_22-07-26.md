---
name: plan:push-notifications-fixes
description: "COMPLEX plan for 3 push-notification fixes: staff new-order push, customer-push reliability wiring, onboarding-completion permission prompt"
date: 22-07-26
feature: rewards-notifications
---

# PLAN — Push Notification Fixes (staff alerts, customer-push wiring, onboarding prompt)

**Date**: 22-07-26 | **Status**: VALIDATED — Gate CONDITIONAL, ready for EXECUTE | **Feature**: rewards-notifications | **Complexity**: COMPLEX

**TL;DR** — One coherent slice across `packages/types` + `packages/api` + `apps/mobile`. Add a
server-side staff new-order push (new dispatch fn + branch→staff→token query + one `POST /orders`
call), extract a shared `promptAndRegisterForPush()` seam and wire it into onboarding completion
(reusing the existing checkout seam + shared fire-once flag), and lock everything up to the send
boundary with Fully-Automated tests. On-device delivery (AC9) and the live `EXPO_ACCESS_TOKEN`
operator check (AC10) stay Agent-Probe by design — this plan does **not** claim to close the
standing real-on-device-delivery Known Gap. **No DB migration required.**

## Overview / Context

Grounded in `process/context/all-context.md` (rewards-notifications feature), `process/context/tests/all-tests.md`,
and the locked SPEC (`push-notifications-fixes_SPEC_22-07-26.md`, 10 ACs, zero open questions). Three
backlog items all trace to one structural fact: push registration + permission-request are wired into
exactly ONE call site today (customer checkout). Staff never reach it (no staff registration/dispatch
exists), and there is no earlier customer permission ask. This plan closes the code-controllable
portion of all three: staff get a new server-side dispatch, customers gain an onboarding-completion
registration path, and both are proven up to the send boundary. The genuinely un-automatable surface
(real on-device delivery + a live `EXPO_ACCESS_TOKEN`) is called out as Agent-Probe, not silently
claimed fixed.

Complexity: **COMPLEX** (3 packages, 10 ACs, order-placement critical path + staff trust-boundary
targeting, two new test suites). Not a phase program — single-session slice, one plan file.

---

## Goals

1. Staff assigned to a branch get a push when a new order is placed there (AC1–AC4).
2. The customer-push code paths that were broken/unwired are fixed up to the send boundary, and
   customers gain an earlier registration path via onboarding (AC5–AC8), reducing the "never
   registered a token" root cause.
3. New customers are asked for notification permission at onboarding completion, without ever
   double-asking at checkout in the same session (shared fire-once flag) (AC5, AC7, AC8).

## Non-Goals (from SPEC Out Of Scope — do not implement)

- Verifying/setting `EXPO_ACCESS_TOKEN` in any deployed env (operator action; AC10 documents it).
- Persisting the "already asked" flag across app restarts (session-scoped stays as-is).
- A customer "order received" push on placement (`OrderNotificationEvent` unchanged).
- A staff notification-center UI (list/badge/tap screen) — push send + data row only.
- Receipt-stage `DeviceNotRegistered` polling; marketing triggers (PUSH-005).
- Changing WHICH order-status transitions push the customer (still accepted/preparing/ready/cancelled).

---

## Acceptance Criteria (from SPEC — testable)

| AC | Outcome | Strategy |
|---|---|---|
| AC1 | Order placed at branch B ⇒ every staff with `assigned_branch_id=B` and ≥1 token gets a send; branch-C staff get none | Fully-Automated |
| AC2 | Staff-push dispatch throwing/erroring never blocks `POST /orders` success (still 201) | Fully-Automated |
| AC3 | Staff notification row/payload targets the placed order (`target_params.orderId`) | Fully-Automated |
| AC4 | A permanent `DeviceNotRegistered` staff token is pruned via the existing `sendAndPrune` | Fully-Automated |
| AC5 | Onboarding completion fires `requestNotificationPermission()` exactly once | Fully-Automated |
| AC6 | Onboarding grant ⇒ `registerDeviceToken()` called immediately | Fully-Automated |
| AC7 | Shared fire-once flag: onboarding ask then checkout ask = one OS request in a session | Fully-Automated |
| AC8 | Onboarding decline/undetermined never blocks the nav-gate flip | Fully-Automated |
| AC9 | On real iOS + Android: OS dialog appears + grant; customer status push + staff new-order push actually arrive | Agent-Probe |
| AC10 | Operator confirms `EXPO_ACCESS_TOKEN` set for the deployed API env | Agent-Probe / operator checklist |

---

## Locked Design Decisions (mechanical, no INNOVATE debate needed)

- **D1 — Separate `StaffNotificationType`, do NOT widen `NotificationType`.** The `notifications.type`
  column is `varchar` (not a pg enum), so a staff value needs no migration and no DB constraint
  change. Crucially, `NotificationType` has exhaustive `Record<NotificationType,…>` consumers in the
  **customer** app (`apps/mobile/src/app/(tabs)/notifications/index.tsx` `TYPE_ICON`,
  `apps/mobile/src/features/notifications/lib/notification-factory.ts` `TYPE_TARGET`). Widening the
  union would force customer-side edits + a customer icon/target for a staff-only concern. Instead
  add a standalone `StaffNotificationType = 'staff_new_order'` (+ runtime array) and a standalone
  `StaffNotificationTargetScreen = 'staff_order_detail'`. Staff rows are scoped to staff `user_id`
  and never returned by a customer's `GET /notifications`, so the customer maps never encounter the
  value. This keeps blast radius OFF the customer exhaustive maps.
- **D2 — Extract a shared `promptAndRegisterForPush()` seam** into
  `apps/mobile/src/features/notifications/lib/notification-permission.ts`. It composes the EXISTING
  `requestNotificationPermission()` → (on `'granted'`) `registerDeviceToken()` chain (currently
  inlined at `checkout.tsx`). Both checkout and onboarding call this one function. This is NOT a new
  permission-request path (SPEC constraint satisfied — it only composes the two existing functions),
  it DRYs the duplicated inline chain, and it makes AC5–AC8 unit-testable in node vitest without RN
  rendering. Signature carries an optional injected-deps param for test spies:
  `promptAndRegisterForPush(deps?: { request?; register? }): Promise<void>` defaulting to the real fns.
- **D3 — Staff resolution keys on `users.assigned_branch_id`** (STAFF-001 precedent: this is the
  authoritative staff↔branch link; `assigned_branch_id` is null for customers). Query staff for the
  order's branch = `users.assigned_branch_id = order.branchId`. No role filter needed (customers have
  null assigned_branch_id); execute-agent may add `role <> 'customer'` defensively if it costs nothing.
- **D4 — Staff dispatch is awaited-and-swallowed after the transaction commits**, mirroring the
  `dispatchOrderNotification` swallow-and-log contract. Awaited (not fire-and-forget) so the AC1/AC3
  integration tests are deterministic; internally never throws, so AC2 (placement still 201) holds.
  Reuses the module-private `loadPushTokens` + `sendAndPrune` verbatim (SPEC constraint — no second
  pruning/send implementation).

---

## Touchpoints (exact files)

| # | File | Change |
|---|---|---|
| T1 | `packages/types/src/notifications.ts` | ADD `StaffNotificationType = 'staff_new_order'`, `STAFF_NOTIFICATION_TYPES` runtime array, `StaffNotificationTargetScreen = 'staff_order_detail'`. Do NOT touch `NotificationType` / `NotificationTargetScreen`. |
| T2 | `packages/api/src/routes/lib/notification-dispatch.ts` | ADD `dispatchNewOrderStaffNotification(order)`: resolve branch staff, resolve branch name, write one staff `notifications` row per staff user (`type:'staff_new_order'`, `target_screen:'staff_order_detail'`, `target_params:{ orderId }`), `loadPushTokens(staffUserId)` + `sendAndPrune`. Wrap in try/catch, never throw. Reuse existing `loadPushTokens` + `sendAndPrune`. |
| T3 | `packages/api/src/routes/orders.ts` | IMPORT `dispatchNewOrderStaffNotification`; after `const result = await db.transaction(...)` (line 126) and BEFORE `res.status(201).json({ order: result })` (line 562), add `await dispatchNewOrderStaffNotification(result)`. **VALIDATE-LOCKED: pass `result` directly (it IS `serializeOrder(...)` output, `ApiOrder`, exposing camelCase `id`/`orderNumber`/`branchId`). Do NOT use the raw `createdOrder`-row fallback — that row is snake_case and would mismatch the param type.** |
| T4 | `apps/mobile/src/features/notifications/lib/notification-permission.ts` | ADD `promptAndRegisterForPush(deps?)` per D2. |
| T5 | `apps/mobile/src/app/(onboarding)/index.tsx` | IMPORT `promptAndRegisterForPush`; on the success continuation of `onSubmit` (AFTER the `if (!result.ok) { …; return; }` guard at ~line 99) call it fire-and-forget (`void promptAndRegisterForPush().catch(...)`) — never awaited, never blocks the nav-gate flip. |
| T6 | `apps/mobile/src/app/(tabs)/cart/checkout.tsx` | REPLACE the inline `requestNotificationPermission().then(...register...)` chain (lines 141–143) with a single `void promptAndRegisterForPush().catch(...)` call (DRY; behavior identical). Remove the now-unused `requestNotificationPermission`/`registerDeviceToken` imports (lines 41–42); import `promptAndRegisterForPush` from the same module. |
| T7 (new test) | `packages/api/src/routes/__tests__/staff-order-notification.integration.test.ts` | AC1–AC4, hermetic self-seeding (mirrors `notifications.integration.test.ts`). |
| T8 (new test) | `apps/mobile/src/features/notifications/lib/__tests__/prompt-and-register.test.ts` | AC5–AC8, node vitest, injected spies + `__resetPermissionSeam`. |

## Public Contracts

- **New (server-internal):** `dispatchNewOrderStaffNotification(order)` in `notification-dispatch.ts`
  — internal module export, consumed only by `orders.ts`. Not an HTTP contract.
- **`POST /orders` request/response shape UNCHANGED.** The staff push is a post-commit side effect;
  the customer response (201 + `{ order }`) is byte-identical. No new field, no status-code change.
- **New (types):** `StaffNotificationType`, `STAFF_NOTIFICATION_TYPES`, `StaffNotificationTargetScreen`
  — additive exports; existing `NotificationType` / `NotificationTargetScreen` unions untouched (no
  breaking widening).
- **New (mobile):** `promptAndRegisterForPush(deps?)` — additive export from `notification-permission.ts`.
  `requestNotificationPermission` / `registerDeviceToken` signatures unchanged.
- **DB:** `notifications` rows may now carry `type='staff_new_order'` (varchar column — no schema/
  migration change). `device_tokens` unchanged.

## Blast Radius

- **6 source files** (T1–T6) + **2 new test files** (T7–T8). 3 packages (`types`, `api`, mobile).
- **Risk class:** order-placement critical path (T3 — must not break `POST /orders` success) +
  staff trust-boundary targeting (T2 — branch isolation: only the order's branch staff are pushed).
  NOT schema/migration (varchar column), NOT billing, NOT auth-flow (reuses existing session gates).
- **Additive-only for existing consumers:** no existing union widened, no existing HTTP contract
  changed, no existing function signature changed. Customer notification maps untouched (D1).
- **Key correctness risks (fold into EXECUTE care):**
  1. Branch isolation — a branch-C staff member must receive NOTHING for a branch-B order (AC1 locks).
  2. Placement resilience — a throwing/erroring staff dispatch must never turn a 201 into a 500
     (AC2 locks; dispatch swallows internally).
  3. Fire-once regression — the shared module flag must still prevent a checkout re-ask after an
     onboarding ask in the same session (AC7 locks).
  4. Onboarding never blocked — decline/undetermined must not delay the nav flip (AC8 locks;
     fire-and-forget + never-throws).

---

## Implementation Checklist (atomic, ordered)

1. **T1** — In `packages/types/src/notifications.ts`, add `export type StaffNotificationType =
   'staff_new_order';`, `export const STAFF_NOTIFICATION_TYPES: readonly StaffNotificationType[] =
   ['staff_new_order'];`, and `export type StaffNotificationTargetScreen = 'staff_order_detail';`.
   Leave `NotificationType` / `NotificationTargetScreen` untouched. Run `pnpm --filter @jojopotato/types typecheck`.
2. **T2** — In `notification-dispatch.ts`, add `dispatchNewOrderStaffNotification(order: { id: string;
   branchId: string; orderNumber: string })`:
   a. `try { … } catch (err) { console.error('[notify] staff new-order dispatch failed', err); }` (never throws).
   b. Resolve staff: `select id from users where assigned_branch_id = order.branchId` (D3).
   c. Resolve branch name: `select name from branches where id = order.branchId` (for copy).
   d. For each staff user: insert one `notifications` row (`user_id: staffId`, `type: 'staff_new_order'`,
      `title: \`New order — ${order.orderNumber}\``, `body: \`New order placed at ${branchName}\``,
      `target_screen: 'staff_order_detail'`, `target_params: { orderId: order.id }`); then
      `const tokens = await loadPushTokens(staffId); await sendAndPrune(tokens, { title, body, data:
      { type: 'staff_new_order', orderId: order.id } });`. **Keep the staff push payload PII-free —
      `target_params` carries ONLY `orderId`; no customer name/phone/address in title/body/data.**
   e. Import the new types from `@jojopotato/types`.
3. **T3** — In `orders.ts`, import `dispatchNewOrderStaffNotification`; insert `await
   dispatchNewOrderStaffNotification(result);` after the transaction resolves (`const result = await
   db.transaction(...)`, line 126), before `res.status(201).json({ order: result })` (line 562).
   **VALIDATE-LOCKED (open item resolved): `result` IS `serializeOrder(createdOrder, insertedItems)`
   (serializers.ts line 559, returns `ApiOrder`), which exposes camelCase `id`, `orderNumber`,
   `branchId`. Pass `result` directly. Do NOT use the raw-`createdOrder`-row fallback — the raw row
   is snake_case (`order_number`/`branch_id`) and would NOT satisfy the camelCase param type.** Run
   `pnpm --filter @jojopotato/api typecheck`.
4. **T4** — In `notification-permission.ts`, add:
   ```
   export async function promptAndRegisterForPush(
     deps: { request?: () => Promise<PermissionResult>; register?: () => Promise<void> } = {},
   ): Promise<void> {
     const request = deps.request ?? requestNotificationPermission;
     const register = deps.register ?? registerDeviceToken;
     const result = await request();
     if (result === 'granted') await register();
   }
   ```
   (Never throws in normal flow — the underlying fns already swallow.)
5. **T5** — In `(onboarding)/index.tsx`, import `promptAndRegisterForPush`; inside `onSubmit`, AFTER
   the `if (!result.ok) { …; return; }` failure guard (~line 99), on the success continuation add
   `void promptAndRegisterForPush().catch((err) => console.error('Failed to set up notifications:',
   err));`. Do NOT await; do NOT gate navigation on it. (Note: the code uses an early-return-on-
   failure guard, not an `if (result.ok)` block — place the call on the fall-through success path.)
6. **T6** — In `checkout.tsx`, replace the inline `requestNotificationPermission().then(...)` chain
   (lines 141–143) with `void promptAndRegisterForPush().catch((err) => console.error('Failed to set up notifications:', err));`.
   Remove the now-unused `requestNotificationPermission`/`registerDeviceToken` imports (lines 41–42);
   import `promptAndRegisterForPush` from `@/features/notifications/lib/notification-permission`.
7. **T7** — Write `staff-order-notification.integration.test.ts` (hermetic; self-seeding — mirror
   `notifications.integration.test.ts` beforeAll/afterAll + `insertNotification` helper shape):
   seed branch B + branch C; seed staff-B1 (with a `device_tokens` row), staff-B2 (no token),
   staff-C1 (with a token); seed a customer; place an order at B via `POST /orders`.
   - **AC1** — assert a `notifications` row (`type='staff_new_order'`) EXISTS for staff-B1 and staff-B2
     and does NOT exist for staff-C1 (branch isolation on the write side is the strongest, least-brittle
     proof). Optionally add `vi.spyOn(pushProvider, 'sendPush')` (import the module:
     `push = await import('../../lib/push-provider')`) to confirm staff-B1's token appeared in a send
     call and staff-C1's did not — the `reward-unlock-notify.integration.test.ts` `vi.spyOn(push,'sendPush')`
     pattern.
   - **AC2** — force the staff dispatch to throw (e.g. `vi.spyOn(push,'sendPush').mockRejectedValue(...)`
     or seed a state that errors inside the try) and assert `POST /orders` still returns 201.
   - **AC3** — assert staff-B1's `notifications` row has `target_params.orderId === orderId`
     (mirrors the existing `oldest.targetParams` assertion in `notifications.integration.test.ts`).
   - **AC4** — **VALIDATE-LOCKED mechanism:** the log-fallback (`EXPO_ACCESS_TOKEN` unset) returns
     every token `'ok'` and can NEVER prune, so a prune assertion against it is vacuous. Use the
     `push-provider.test.ts` prune pattern: set `process.env.EXPO_ACCESS_TOKEN='test-access-token'`,
     mock `Expo.prototype.sendPushNotificationsAsync` to return a `DeviceNotRegistered` ticket for the
     staff token (and `Expo.isExpoPushToken → true`), then assert the staff `device_tokens` row was
     deleted. Restore/delete `EXPO_ACCESS_TOKEN` in afterEach/afterAll so it does not pollute sibling
     suites in the same worker.
8. **T8** — Write `prompt-and-register.test.ts` (node vitest):
   - **AC5** — call `promptAndRegisterForPush({ request: spy, register: spy2 })` with an injected
     `request` spy → `'granted'`; assert `request` called exactly once.
   - **AC6** — same, `request → 'granted'`, assert `register` called.
   - **AC7** — **VALIDATE-LOCKED mechanism:** drive the REAL seam (default deps, i.e.
     `promptAndRegisterForPush()` with NO injected `request`) so the module-level `alreadyAsked` flag
     is actually exercised — an injected `request` spy bypasses the flag and makes this test vacuous.
     Call `__resetPermissionSeam('granted')` once at the top; call `promptAndRegisterForPush()` twice;
     assert the second call's underlying `requestNotificationPermission` returns `'undetermined'`
     (fire-once) and `register` was NOT invoked a second time. Spy `registerDeviceToken` via injected
     `register` on both calls to count invocations while keeping the real `request` path.
   - **AC8** — inject `request → 'denied'`; assert `register` not called and no throw.
9. Run the full verification order (see Verification Evidence) and fix any red gate inline.

---

## Verification Evidence

Test tiers via `vc-test-coverage-plan` (all-tests.md routing chain + blast-radius test files loaded).
Runners: `packages/api` vitest+supertest (needs local Postgres — `docker compose up -d` or the
running native instance + `db:migrate`); `apps/mobile` vitest (node env, pure-TS); `packages/types`
tsc only.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `staff-order-notification.integration.test.ts` — branch-B token-staff gets send attempt, branch-C staff gets none | Fully-Automated | AC1 (staff push on placement, branch-isolated) |
| Same suite — force staff-dispatch to throw, assert `POST /orders` still 201 | Fully-Automated | AC2 (staff push never blocks placement) |
| Same suite — assert staff `notifications` row `target_params.orderId === orderId` | Fully-Automated | AC3 (staff push targets order detail) |
| Same suite — set `EXPO_ACCESS_TOKEN` + mock Expo client → `DeviceNotRegistered`, assert token pruned | Fully-Automated | AC4 (dead-token prune reuses pattern) |
| `prompt-and-register.test.ts` — `request` invoked exactly once per completion | Fully-Automated | AC5 (prompt fires once per onboarding completion) |
| Same suite — `request→'granted'` ⇒ `register` called | Fully-Automated | AC6 (grant registers token immediately) |
| Same suite — REAL seam onboarding-then-checkout in one session ⇒ one underlying OS request | Fully-Automated | AC7 (shared fire-once flag prevents double-ask) |
| Same suite — `request→'denied'` ⇒ no throw, `register` not called, nav path unaffected | Fully-Automated | AC8 (decline never blocks navigation) |
| `pnpm typecheck` (types+api+mobile) + `pnpm lint` + `pnpm format:check` | Fully-Automated | Cross-package regression guard (no widened union breaks customer maps; T3 doesn't break orders) |
| On-device walkthrough (iOS + Android): onboarding OS dialog appears + grant; customer order-status push arrives; staff new-order push arrives | Agent-Probe | AC9 (real on-device prompt + delivery) — requires live `EXPO_ACCESS_TOKEN` + physical devices; no RN E2E runner, OS dialogs undrivable from jsdom/vitest |
| Operator confirms `EXPO_ACCESS_TOKEN` set for deployed API env | Agent-Probe / operator checklist | AC10 (live push credential configured) — not code-provable (runtime secret) |

**Vacuous-green note:** every DEVELOPED code path (staff dispatch T2/T3, permission seam T4, both
wirings T5/T6) has a Fully-Automated gate (AC1–AC8). AC9/AC10 prove the RUNTIME/OPERATOR surface
only (real device delivery + a live secret), which is genuinely un-automatable here (standing
project-wide no-RN-E2E-runner gap + a runtime env var). They are classified **Agent-Probe** (a real
proving strategy for on-device), NOT Known-Gap — no developed behavior is left resting on Known-Gap
alone, so the plan is not vacuously green. This plan explicitly does NOT claim to close the
`real-push-delivery_15-07-26` standing Known Gap (real on-device delivery) — AC9 re-surfaces it as
an owed user walkthrough, per that plan's own REPORT.

## Test Infra Improvement Notes

(none identified yet — the shared jest reanimated layout-animation mock gap in all-tests.md does not
apply here; T8 is node vitest, no RN render.)

---

## Phase Completion Rules

- **CODE DONE** — T1–T8 implemented; all Fully-Automated gates green (AC1–AC8), typecheck + lint +
  format:check clean across `types`/`api`/`mobile`. This is the state reachable by an agent.
- **VERIFIED** — CODE DONE **plus** the AC9 on-device walkthrough (iOS + Android separately — an
  Android pass does NOT transfer to iOS) performed and confirmed by the user, **plus** the AC10
  operator confirmation that `EXPO_ACCESS_TOKEN` is live in the deployed env.
- **The task folder stays in `active/` until VERIFIED.** Per the standing project-wide no-RN-E2E-runner
  gap, AC9/AC10 are owed by the user and cannot be closed by an agent — do NOT archive to `completed/`
  on CODE DONE alone (same rule as every prior push/onboarding plan in this repo).

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/rewards-notifications/active/push-notifications-fixes_22-07-26/push-notifications-fixes_PLAN_22-07-26.md`
2. **Last completed step:** VALIDATE written (this file). No code changed.
3. **Validate-contract status:** WRITTEN — Gate CONDITIONAL (0 FAILs, concerns are testability-
   precision + T3 approach, all resolved as Execute-Agent Instructions below). Ready for EXECUTE.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`,
   `process/context/tests/all-tests.md`, the SPEC (same folder); source: `notification-dispatch.ts`,
   `notifications.ts` (types), `device_tokens.ts`, `notification-permission.ts`, `(onboarding)/index.tsx`,
   `orders.ts`, `checkout.tsx`, `serializers.ts`, `users.ts` schema, `push-provider.ts`.
5. **Next step for a fresh agent:** EXECUTE the checklist in order (T1→T8), applying the Execute-Agent
   Instructions in the contract. EXECUTE start: `pnpm --filter @jojopotato/api test` (staff suite) |
   `pnpm --filter @jojopotato/mobile test` (prompt-and-register suite) | Agent-Probe: AC9/AC10
   on-device + operator | high-risk pack: no (varchar column, no migration, additive HTTP contract).

## Validate Contract

Status: CONDITIONAL
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals present (S2 schema-adjacent varchar-only notification type + S1/S7 borderline — 6 source files across 3 packages, but tightly coupled one-slice change with a strict ordered checklist). MEDIUM-low; a single sequential vc-execute-agent (opus) is the right fit — the T1→T8 steps are dependency-ordered (types → dispatch → trigger → seam → wirings → tests), not independent fan-out work.

Test gates (C3 5-column — ADDITIVE; legacy line form retained below):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Staff at the order's branch (with a token) get a send; other-branch staff get none | Fully-Automated | `staff-order-notification.integration.test.ts` — assert `notifications` row exists for branch-B staff, absent for branch-C staff; optional `vi.spyOn(push,'sendPush')` confirms B1 token sent | B |
| AC2 | Staff dispatch throw/error never turns `POST /orders` 201 into 500 | Fully-Automated | Same suite — force dispatch to throw (spy `sendPush` reject), assert response still 201 | B |
| AC3 | Staff notification row targets the placed order (`target_params.orderId`) | Fully-Automated | Same suite — assert B1 row `target_params.orderId === orderId` | B |
| AC4 | Permanent `DeviceNotRegistered` staff token pruned via `sendAndPrune` | Fully-Automated | Same suite — set `EXPO_ACCESS_TOKEN`, mock `Expo.prototype.sendPushNotificationsAsync`→`DeviceNotRegistered`, assert `device_tokens` row deleted | B |
| AC5 | Onboarding completion fires `request()` exactly once | Fully-Automated | `prompt-and-register.test.ts` — injected `request` spy, assert 1 call | B |
| AC6 | Onboarding grant ⇒ `register()` called | Fully-Automated | Same suite — injected `request→'granted'`, assert `register` called | B |
| AC7 | Shared fire-once: onboarding then checkout = one OS request | Fully-Automated | Same suite — REAL seam via `__resetPermissionSeam`, call twice, 2nd returns `'undetermined'`, register not called twice | B |
| AC8 | Onboarding decline never blocks nav flip | Fully-Automated | Same suite — injected `request→'denied'`, assert register not called, no throw | B |
| AC9 | Real on-device OS dialog + push delivery (iOS + Android) | Agent-Probe | Manual walkthrough — live `EXPO_ACCESS_TOKEN` + physical devices | C (owed by user; standing no-RN-E2E-runner gap) |
| AC10 | Operator confirms `EXPO_ACCESS_TOKEN` set in deployed env | Agent-Probe | Operator checklist item | C (owed by operator; runtime secret, not code-provable) |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist (new test written during EXECUTE); C — deferred to a named later owner (user walkthrough / operator); D — backlog stub. C-4 reconciliation: `strategy` carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe); Known-Gap is not used anywhere in this contract.

Legacy line form (retained so existing validate-contract consumers still parse):
- Staff dispatch (T2/T3): Fully-automated: `pnpm --filter @jojopotato/api test` (staff-order-notification.integration.test.ts — AC1–AC4)
- Permission seam + wirings (T4/T5/T6): Fully-automated: `pnpm --filter @jojopotato/mobile test` (prompt-and-register.test.ts — AC5–AC8)
- Cross-package regression: Fully-automated: `pnpm typecheck && pnpm lint && pnpm format:check`
- On-device delivery: agent-probe: iOS + Android walkthrough (live EXPO_ACCESS_TOKEN + physical devices) — AC9
- Live push credential: agent-probe: operator confirms EXPO_ACCESS_TOKEN in deployed env — AC10

Dimension findings:
- Infra fit: PASS — No migration (verified: `notifications.type`/`target_screen` are `varchar`, `target_params` is `jsonb`). All 6 source + 2 test target paths verified present on disk. Reused seams confirmed with matching signatures: `loadPushTokens`/`sendAndPrune` (module-private in notification-dispatch.ts), `requestNotificationPermission`/`registerDeviceToken`/`__resetPermissionSeam` (notification-permission.ts). Correct runners (packages/api vitest+supertest w/ local Postgres; apps/mobile vitest node env). Plan structural validator: 0 failures.
- Test coverage: CONCERN — all 8 developed ACs (AC1–AC8) are genuinely Fully-Automated with proven in-repo patterns (hermetic self-seed: notifications.integration.test.ts; prune mock: push-provider.test.ts; sendPush spy: reward-unlock-notify.integration.test.ts). AC9/AC10 correctly Agent-Probe. Two real vacuous-green risks require explicit mechanism (E1/E2 below): AC4 cannot prune against the `EXPO_ACCESS_TOKEN`-unset log-fallback (returns all-'ok', never prunes); AC7 must drive the REAL seam or an injected spy bypasses the fire-once flag.
- Breaking changes: PASS — Additive-only. Standalone `StaffNotificationType`/`StaffNotificationTargetScreen` avoid widening `NotificationType` (verified two exhaustive `Record<NotificationType,…>` customer maps at notifications/index.tsx:19 + notification-factory.ts:39 would otherwise break). `POST /orders` request/response byte-identical (dispatch is a post-commit side effect before the existing `res.status(201)`). No existing signature changed.
- Security surface: PASS — Staff branch-isolation trust-boundary is the key property, proven by AC1 (a real Fully-Automated test — the proportionate control). No new auth/session surface (T3 reuses the existing customer session gate; staff rows are session-scoped to staff `user_id`). Staff push payload is PII-free (orderId/orderNumber/branchName only — E3 locks it). No user-controlled free text enters the push. NOT the high-risk class warranting a 5-artifact evidence pack (concur with plan "high-risk pack: no"; narrower than CART-003's session-auth CRUD surface, which itself declined the pack).
- Section A feasibility (T1 types): PASS — additive exports, mechanically trivial, no migration.
- Section B feasibility (T2 staff dispatch): CONCERN — feasible (loadPushTokens/sendAndPrune reused verbatim); highest-risk edit is AC4 prune-path testability (must mock the Expo client, E2). Minor: staff-resolution query could also match admin/super_admin rows carrying an `assigned_branch_id` (D3's optional `role <> 'customer'` filter addresses it — not a leak, over-broad-recipient only).
- Section C feasibility (T3 orders trigger): PASS — **open item resolved.** `result` (serializers.ts:559 = `serializeOrder(...)`, type `ApiOrder`) exposes camelCase `id`/`orderNumber`/`branchId` — matches the dispatch param exactly. Pass `result` directly; the raw-`createdOrder`-row fallback is unnecessary and would be a snake_case type-mismatch bug (E4). Insertion point clean (after line 126, before line 562).
- Section D feasibility (T4 permission seam): PASS — additive composed function, node-vitest-testable via deps injection.
- Section E feasibility (T5 onboarding wiring): CONCERN (minor) — edit target present (`onSubmit` line 89) but the code uses an `if (!result.ok){…return}` early-return guard (line 99), not an `if (result.ok)` block; place the fire-and-forget call on the success continuation after the guard (E5, wording precision only).
- Section F feasibility (T6 checkout DRY): PASS — exact edit target lines 141–143; imports 41–42 to be cleaned; fire-once flag preserved (lives inside `requestNotificationPermission`, shared correctly).
- Section G feasibility (T7/T8 tests): CONCERN — same testability-precision items as the test-coverage dimension (AC4 mock, AC7 real seam); all patterns proven in-repo, just need the mechanism locked (E1/E2).

Execute-Agent Instructions (concerns resolved as instructions — no plan-blocking FAILs):
- E1 (AC7 non-vacuous): the AC7 fire-once test MUST drive the REAL `requestNotificationPermission` seam (default deps of `promptAndRegisterForPush()`), NOT an injected `request` spy — an injected spy bypasses the module-level `alreadyAsked` flag and makes the test vacuous. Reset once via `__resetPermissionSeam('granted')`, call twice, assert the 2nd returns `'undetermined'` and `register` is not called twice.
- E2 (AC4 non-vacuous): the AC4 prune test MUST set `process.env.EXPO_ACCESS_TOKEN='test-access-token'` and mock `Expo.prototype.sendPushNotificationsAsync` to emit a `DeviceNotRegistered` ticket (plus `Expo.isExpoPushToken → true`), then assert the staff `device_tokens` row is deleted — the log-fallback (token unset) returns all-'ok' and can NEVER prune, so a prune assertion against it would be false-green. Restore/delete `EXPO_ACCESS_TOKEN` in afterEach/afterAll to avoid polluting sibling suites in the worker (push-provider.test.ts precedent).
- E3 (security): keep the staff push payload PII-free — `target_params` carries ONLY `orderId`; title/body/data must not include customer name/phone/address. Only order number + branch name in the copy.
- E4 (T3 approach, LOCKED): pass `result` (the `serializeOrder` output / `ApiOrder`) directly to `dispatchNewOrderStaffNotification`. Do NOT use the raw `createdOrder` transaction row — it is snake_case and mismatches the camelCase `{ id; branchId; orderNumber }` param. Define the param type as (or compatible with) `Pick<ApiOrder,'id'|'branchId'|'orderNumber'>`.
- E5 (T5 insertion precision): `(onboarding)/index.tsx` `onSubmit` uses an `if (!result.ok){…;return;}` early-return guard, not an `if (result.ok)` block. Place `void promptAndRegisterForPush().catch(...)` on the fall-through success path after that guard. Never await; never gate the nav flip.
- E6 (optional, D3): consider adding `role <> 'customer'` (or `role IN ('staff','admin','super_admin')`) to the staff-resolution query if it costs nothing, to avoid pushing to an admin who happens to carry an `assigned_branch_id`. Not required for AC1.

Open gaps: AC9 (real on-device OS dialog + push delivery, iOS + Android) and AC10 (operator confirms `EXPO_ACCESS_TOKEN` live in deployed env) — both Agent-Probe, owed by user/operator, not code-provable. Same standing project-wide no-RN-E2E-runner gap + runtime-secret gap carried by every prior push/onboarding plan; this plan explicitly does NOT claim to close the `real-push-delivery_15-07-26` Known Gap.

What this coverage does NOT prove:
- `staff-order-notification.integration.test.ts` (AC1–AC4): proves branch-isolated staff notification-row writes + send-attempt targeting + dead-token prune UP TO the `sendPush` boundary (mocked). Does NOT prove a real push leaves the server, reaches Expo, or lands on a staff device — that is AC9 (Agent-Probe). Does NOT prove behavior when `EXPO_ACCESS_TOKEN` is genuinely set in production (the mock substitutes for the live client).
- `prompt-and-register.test.ts` (AC5–AC8): proves the compose-and-fire-once logic in node vitest with a simulated permission result. Does NOT prove the real OS permission dialog appears, that a real Expo push token is obtained, or that `registerDeviceToken`'s real `POST /notifications/device-tokens` round-trip succeeds (all AC9, Agent-Probe — dynamic native imports never execute under vitest).
- `pnpm typecheck && pnpm lint && pnpm format:check`: proves no type/lint/format regression across types/api/mobile (incl. that the standalone staff types did not break the customer exhaustive maps, and that T3 did not break `orders.ts`). Does NOT prove runtime behavior of any of the above.

Gate: CONDITIONAL (0 FAILs; 4 CONCERNs reducing to testability-precision + T3 approach + one wording nuance, all accepted and recorded as Execute-Agent Instructions E1–E6; plan updated in place with the T3 lock and the E1/E2 test mechanisms). Proceed to EXECUTE.
Accepted by: session (delegated VALIDATE run — orchestrator instructed to write the contract and emit the verdict). Accepted concerns: test-coverage vacuous-green risk on AC4 (→E2) and AC7 (→E1); Section B admin-recipient over-breadth (→E6); Section E onboarding insertion wording (→E5). All are execute-time-resolvable, none require returning to PLAN.

## Autonomous Goal Block

```
SESSION GOAL: Push Notification Fixes — staff new-order push, customer-push wiring, onboarding permission prompt (rewards-notifications)
Charter + umbrella plan: N/A — single plan
Autonomy: single-plan VALIDATE→EXECUTE. Gate CONDITIONAL accepted (concerns E1–E6 are execute-time instructions, not blockers). No phase program.
Hard stop conditions / safety constraints:
- Staff push must be branch-isolated — a branch-C staff must never receive a branch-B order's push (AC1). If EXECUTE cannot prove this, STOP.
- Staff dispatch must NEVER turn a POST /orders 201 into a 500 (AC2) — the dispatch swallows internally and is awaited-after-commit.
- Keep the staff push payload PII-free (orderId only; no customer name/phone/address) — E3.
- Do NOT widen NotificationType (would break the two customer exhaustive maps) — add standalone staff types only (D1).
- No DB migration is expected (varchar column). If EXECUTE finds a migration is needed, STOP and re-plan.
Next phase: EXECUTE — process/features/rewards-notifications/active/push-notifications-fixes_22-07-26/push-notifications-fixes_PLAN_22-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate CONDITIONAL)
Execute start: pnpm --filter @jojopotato/api test (staff-order-notification.integration.test.ts) | pnpm --filter @jojopotato/mobile test (prompt-and-register.test.ts) | pnpm typecheck && pnpm lint && pnpm format:check | Agent-Probe: AC9 iOS+Android on-device + AC10 operator EXPO_ACCESS_TOKEN | high-risk pack: no
```
