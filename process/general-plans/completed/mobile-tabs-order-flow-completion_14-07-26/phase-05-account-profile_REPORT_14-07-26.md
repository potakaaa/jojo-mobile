---
phase: phase-05-account-profile
date: 2026-07-15
status: COMPLETE
feature: mobile-tabs-order-flow-completion
plan: process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-05-account-profile_PLAN_14-07-26.md
---

# Phase 05 — Account / Profile — EXECUTE Report

TL;DR: Replaced the `<ComingSoon>` Account shell with a real profile view + a new
edit-profile screen (name / birthday MM-DD-YYYY / address), added an additive
`updateProfile()` seam to `useAuth()`, and extracted pure birthday helpers. All
Exit Gate gates green. `role` stays server-owned — never sent, grep-confirmed.

## What Was Done

- **`features/auth/lib/birthday.ts` (new)** — pure `isValidBirthday` (real calendar
  dates, leap-year aware), `assembleBirthday({mm,dd,yyyy}→YYYY-MM-DD)`,
  `splitBirthday(YYYY-MM-DD→{mm,dd,yyyy})`. Extracted from onboarding's inline logic.
- **`features/auth/lib/birthday.test.ts` (new)** — 12 vitest cases (valid/leap/bad
  month-day-year/shape + assemble padding + split null-safety + round-trip).
- **`features/auth/hooks/use-auth.ts`** — added additive `updateProfile({name,birthday,address})`
  to `AuthContextValue`, the provider, the memoized value, and its deps. Calls
  `authClient.updateUser({name,birthday,address})` (explicit field-by-field, never
  `role`, never `onboardedAt`) then `refetch()`. Distinct from `completeProfile()`,
  which re-stamps `onboardedAt`.
- **`app/(tabs)/account/index.tsx`** — real profile view: name + read-only email
  header, birthday/address detail card (friendly "Not set yet" placeholders),
  "Edit profile" nav, Notifications/Help/Order History links, Log out (outline).
  `<ComingSoon>` wrapper + `__DEV__` Component Showcase link removed.
- **`app/(tabs)/account/edit-profile.tsx` (new)** — form: name, 3-field auto-tabbing
  MM/DD/YYYY birthday row, address; pre-filled via `splitBirthday`; inline validation
  via `isValidBirthday`; Save→`updateProfile` with loading/disabled + success
  ("Profile updated.") + error feedback; Cancel→`router.back()`. No `role` field.
- **`app/(tabs)/account/_layout.tsx`** — registered `<Stack.Screen name="edit-profile" options={{ title: 'Edit Profile' }} />`.
- **`app/(tabs)/account/index.test.tsx` (new)** — 3 jest cases (name+email render,
  edit-profile + section links present, Log out fires `signOut`).
- **`app/(tabs)/account/edit-profile.test.tsx` (new)** — 4 jest cases (prefill,
  invalid-birthday blocks Save, valid Save calls `updateProfile` with EXACTLY
  `{name,birthday,address}` and no `role`/`onboardedAt`, no role input rendered).

## What Was Skipped or Deferred

- Onboarding (`(onboarding)/index.tsx`) was intentionally NOT refactored to import
  `birthday.ts` — the plan explicitly permits keeping its inline copy; kept the change
  bounded within blast radius. (Follow-up opportunity, non-blocking.)
- AC7 (true native-restart persistence round-trip) — Agent-Probe / Known-Gap,
  irreducible: no process-restart harness exists project-wide. Unchanged from plan.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | exit 0 |
| Lint (all packages) | `pnpm lint` | exit 0 |
| Mobile tests | `pnpm --filter @jojopotato/mobile test` | exit 0 — **vitest 44 passed** (was 32, +12 birthday), **jest 19 passed** across 5 suites (was 12, +7 account) |
| Role-scope grep | `grep -n "role" .../account/edit-profile.tsx` | no match → PASS |
| Format check | `pnpm format:check` | exit 0 |

No existing tests broken (mobile vitest 32→44, jest 12→19; both strictly additive).

## Plan Deviations

- **Within-blast-radius (test detail):** `authStub` helper param in both new jest
  tests typed `Partial<Record<keyof AuthContextValue, unknown>>` (not
  `Partial<AuthContextValue>`) so `jest.fn()` mock values type-check under the strict
  config; final object cast unchanged. Test-file-only, no runtime impact.
- **Within-blast-radius (util shape):** `splitBirthday` returns fields via indexed
  access with `?? ''` fallback (not array destructuring) to satisfy
  `noUncheckedIndexedAccess`. No behavior change.

No hard-stop-class deviations. `role` server-owned (`input:false`) unchanged.

## Test Infra Gaps Found

- None new. The standing project-wide gap (no RN process-restart / E2E harness)
  is unchanged — AC7 remains the only Agent-Probe/Known-Gap residual.

## Closeout Packet

- Selected plan: `.../phase-05-account-profile_PLAN_14-07-26.md`
- Finished: all Steps A/B/C/D checklist items; Phase Loop Progress Step 5 ticked.
- Verified: typecheck, lint, format, full mobile test suite (vitest+jest), role grep.
- Unverified: AC7 native-restart persistence (Agent-Probe/Known-Gap, irreducible).
- Remaining: orchestrator EVL confirmation run (re-run the 5 Exit Gate gates via
  vc-tester), then UPDATE PROCESS (archive + context update + commit).
- Best next state: EVL confirmation → UPDATE PROCESS.
- Follow-up plan stubs created: none.
- CONTEXT_PARTIAL items: none.

## Forward Preview

### Test Infra Found
- `apps/mobile` jest-expo runner (Phase 4) reused unchanged for `useAuth()`-mocked
  component tests via `jest.mock('@/features/auth/hooks/use-auth', () => ({ useAuth: jest.fn() }))`
  factory — the first `useAuth()`-mocking jest precedent in the repo (avoids loading
  the real hook's top-level `Linking.createURL`). Reusable by any future screen test
  that needs a signed-in profile.

### Blast Radius Changes
- New files: `features/auth/lib/birthday.ts` + `.test.ts`,
  `app/(tabs)/account/edit-profile.tsx` + `.test.tsx`, `app/(tabs)/account/index.test.tsx`.
- Modified: `features/auth/hooks/use-auth.ts` (additive `updateProfile`),
  `app/(tabs)/account/index.tsx` (real view), `app/(tabs)/account/_layout.tsx` (route).

### Commands to Stay Green
- `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm --filter @jojopotato/mobile test && pnpm format:check`

### Dependency Changes
- None. No new packages, no schema/API/migration surface. Uses existing better-auth
  `updateUser`. `role` stays `input:false`.
