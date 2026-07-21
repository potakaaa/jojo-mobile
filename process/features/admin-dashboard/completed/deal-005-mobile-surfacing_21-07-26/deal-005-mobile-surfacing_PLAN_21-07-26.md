---
name: plan:deal-005-mobile-surfacing
description: "Mobile surfacing of live deal schedules (DEAL-005 Phase 3, issue #127) — annotate currently-live deals with a days/hours summary on the Deals tab, Home strip, and Deal Details"
date: 21-07-26
feature: admin-dashboard
---

# DEAL-005 Phase 3 — Mobile Surfacing of Live Deal Schedules (PLAN)

Date: 21-07-26
Status: ✅ VERIFIED — EVL-confirmed green, committed (`f0685f9` source, `83fc7f4` docs, `ab3d916`
nav-entry fix, `cdab2b6` doc-reconciliation, branch `adm-deal-005-p2`). The AC5 nav-entry blocker
was closed by a "See all" entry added to the Home tab's "Deals & offers" header (commit `ab3d916`,
linking to `/(tabs)/deals`), unblocking the full walkthrough. The AC5-AC7 Agent-Probe walkthrough
(Deals tab, Home strip, Deal Details) was performed by the user this session and PASSED. Task
folder archived to `completed/`.
Complexity: SIMPLE (one feature, ~10 files touched, additive-only server change + one new pure formatter + 3 mobile render sites)
SPEC: `deal-005-mobile-surfacing_SPEC_21-07-26.md` (same folder) — locked, all 9 ACs Fully-Automated except AC5–AC7 (Agent-Probe)

## Overview

A deal that is currently showing on the menu may have a `deal_schedules` row (Phase 1 absolute
window and/or Phase 2 recurrence). Today the server already correctly hides a deal that isn't live
(`isDealScheduleLive()` / `resolveLiveDealProductIds()`), but a customer looking at a currently-live
scheduled deal has no way to tell it's time-limited. This phase adds a read-only annotation —
"Available Mon–Fri, 8:00 AM – 8:25 PM" (recurring) or "Available until Jul 25, 6:00 PM" (absolute
window only) — to the Deals tab list, the Home tab's deals strip, and the Deal Details screen. A
deal with zero `deal_schedules` rows (the common case) shows nothing extra.

Nothing about *which* deals are shown changes. The server's live/visible filter
(`branches.ts:207`, `orders.ts`) is untouched.

## Goals

- Give customers a clear, honest, Manila-correct signal that a currently-visible deal is
  time-limited, on all 3 surfaces that render deal products (Deals tab, Home strip, Deal Details).
- Keep the change purely additive: no regression to the regular menu, always-live deals, the
  live/visible filter, or order placement.

## Scope

In scope: additive wire field on the `?isDeal=true` menu response; a new pure client-side
formatter; a new `DealCard` prop; 3 mobile render-site wirings. Out of scope: everything listed in
the SPEC's "Out Of Scope" section (upcoming-deal teaser, menu-filter changes, cart-gating,
auto-refetch, admin authoring changes, the legacy `offers`-model coupon display, multi-row admin
authoring UX).

## Decisions (locked — do not re-open)

1. **Scope = annotate currently-live deals only.** No "Starts Friday" upcoming teaser, no
   cart-gating, no `refetchInterval` auto-drop. Fetch-on-focus stays as-is (existing behavior — a
   card may linger briefly past its window until the next refocus; tracked separately in
   `deal-005-mobile-expiry-refetch_NOTE_21-07-26.md`, not this phase's job).
2. **Client-side (formatter) does ZERO Manila timezone math on `recur_days`/`recur_start_time`/
   `recur_end_time`.** Those are already Manila wall-clock values (Phase 2 stored them that way
   specifically so no second timezone-aware reader is needed) — the formatter only does day-name +
   12-hour-clock STRING formatting on them, exactly like `packages/utils/src/hours.ts`'s existing
   `formatOpeningHours` precedent.
   - **Exception, and the one place real Manila math IS needed:** `starts_at`/`ends_at` on a
     `deal_schedules` row ARE raw UTC instants (real `timestamp` columns, not pre-converted
     strings) — same as everywhere else in this table. Formatting an absolute-window "Available
     until …" date/time from `ends_at` genuinely needs the fixed `+08:00` Manila shift, using the
     exact same technique as `toManilaWallClock()` (shift the epoch, then read only `getUTC*`
     accessors — never a host-local accessor). This is REUSE of an established technique, not new
     invention, and closes SPEC AC4 for the absolute-window display path.
3. **Formatter home: new sibling file, `packages/utils/src/deal-schedule-display.ts`.** NOT an
   extension of `hours.ts` — the input shape is fundamentally different (a day-INDEX array +
   independent per-row absolute bounds vs. `hours.ts`'s per-day-keyed JSON object for a single
   branch). Duplicating the ~6-line `to12Hour()` conversion locally is a lower coupling cost than
   widening `hours.ts`'s public surface for an unrelated domain. `formatOpeningHours`/
   `getIsOpenNow` are untouched.
   **[VALIDATE fix]** The input type is the SHARED `DealScheduleWindow` interface from
   `@jojopotato/types` (checklist step 8) — imported, not duplicated. `packages/utils` already
   depends on and imports types from `@jojopotato/types` in 4 existing files
   (`order-display.ts`, `product-options.ts`, `discount.ts`, `reorder.ts`); it is not a
   zero-inbound-dependency leaf package, so there is no coupling reason to hand-duplicate an
   identical interface under the same name in a second package. Importing the shared type
   removes a drift risk (two structurally-identical `DealScheduleWindow` interfaces silently
   diverging) at zero cost.
4. **Server sends the deal's FULL set of `deal_schedules` rows (already loaded, zero new query
   cost) as raw structured data — never a pre-formatted string.** The formatter, not the server,
   decides recurring-vs-absolute-vs-nothing display logic (SPEC explicitly leaves this to
   INNOVATE/PLAN; centralizing formatting client-side keeps the server dumb/reusable and matches
   the existing wire-shape convention — `ApiMenuProduct` carries raw `basePriceCents`, not a
   pre-formatted price string).
5. **Multi-row display rule (AC8 — admin only ever authors one row today, so this only needs to be
   non-broken, not polished):** the formatter's priority is (a) the first row with all three
   recurrence fields set → format as recurring days+hours; else (b) the first row with a defined
   `ends_at` → format as "Available until …"; else (c) no informative shape exists (e.g. only an
   open-ended `starts_at`-only row with no recurrence) → return `undefined` (no annotation, same
   as the zero-rows case). This is deterministic, never throws, and matches "doesn't break" without
   inventing a combined-listing UI this session.
6. **Mobile render approach: add a NEW `DealCard` prop, `scheduleSummary?: string` — do NOT reuse
   the existing `validUntil?: string` prop.** `validUntil` is load-bearing for a DIFFERENT, already-
   frozen consumer: `(tabs)/branch/index.tsx`'s "Deals" section renders the legacy `offers`-model
   deal (`mapApiBranchDeal`, the `/api/branches/:id` two-handler route — see memory
   `api-branches-two-handler-precedence.md`) and hardcodes a literal `"Valid until: {validUntil}"`
   label around a raw ISO string. Piping our full human sentence ("Available Mon–Fri, 8:00 AM –
   8:25 PM") through that same prop would render as `"Valid until: Available Mon–Fri, …"` —
   double-labeled and wrong. `scheduleSummary` renders as its own unlabeled caption row (the
   formatter already produces a complete sentence, e.g. "Available Mon–Fri, 8:00 AM – 8:25 PM" /
   "Available until Jul 25, 6:00 PM") — used on the Deals-tab list and Home strip. The Deal Details
   screen (not a `DealCard` consumer) gets one new plain `<Text>` row using the same formatted
   string, styled to match its existing caption rows. `validUntil` and its 3 existing call sites
   (incl. `branch/index.tsx`) are UNTOUCHED.
7. **`resolveLiveDealProductIds()` (used by `orders.ts`, the write path) is left byte-unchanged.**
   A NEW sibling function, `resolveLiveDealSchedules()`, is added to `deal-schedule.ts` and reuses
   the same row-fetch internally via a small shared private helper — `branches.ts` (read path)
   switches to the new function; `orders.ts` keeps calling the old one, untouched. This keeps the
   write path's blast radius at zero for this phase (matches SPEC's explicit "no change to
   `isDealScheduleLive()`/order placement" constraint) while avoiding a duplicated SQL query.

## Touchpoints

| File | Change | Additive / Modified |
|---|---|---|
| `packages/api/src/routes/lib/deal-schedule.ts` | Extract shared row-fetch into a private helper; add new `resolveLiveDealSchedules()` returning `{ liveDealIds, schedulesByDeal }`; `resolveLiveDealProductIds()` body refactored to call the same helper, public signature/behavior unchanged | Additive (new export) + internal refactor (no external behavior change) |
| `packages/api/src/routes/branches.ts` (~line 207, ~line 232) | Call `resolveLiveDealSchedules()` instead of `resolveLiveDealProductIds()`; destructure `{ liveDealIds, schedulesByDeal }`; pass `schedulesByDeal.get(product.id)` into `serializeMenuProduct()` as a new 4th arg, only when `isDealMenu` | Modified (2 call sites) |
| `packages/api/src/routes/lib/serializers.ts` (~198-214, ~328-360) | Add `ApiDealScheduleWindow` interface + `schedule?: ApiDealScheduleWindow[]` field on `ApiMenuProduct`; `serializeMenuProduct()` gains optional 4th param `scheduleWindows?: DealScheduleWindow[]`, maps to wire shape, key omitted entirely when absent/empty | Additive |
| `packages/utils/src/deal-schedule-display.ts` (NEW) | Pure formatter: `formatDealScheduleSummary(windows)` → `string \| undefined` | New file |
| `packages/utils/src/index.ts` | `export * from './deal-schedule-display';` | Additive (1 line) |
| `packages/utils/src/__tests__/deal-schedule-display.test.ts` (NEW) | Fully-Automated unit tests (AC1, AC2, AC3, AC4, AC8) | New file |
| `packages/types/src/menu.ts` (~41-57) | Add `DealScheduleWindow` interface (client mirror of `ApiDealScheduleWindow`, camelCase) + `schedule?: DealScheduleWindow[]` on `Product` | Additive |
| `packages/ui/src/components/deal-card.tsx` | Add `scheduleSummary?: string` prop + one new unlabeled `<Text>` caption row (parallel to the existing `validUntil` row, own theme-token styling, `mode` respected) | Additive |
| `packages/ui/src/components/__tests__/deal-card.test.tsx` | Add render assertions: `scheduleSummary` renders when provided, absent when omitted, both light/dark `mode` | Additive |
| `apps/mobile/src/features/deals/lib/deal-product-to-card.ts` | No change to `dealProductToCard()` itself (it maps `Product → Deal`, unrelated to the new prop) — see call-site changes below instead | Unchanged |
| `apps/mobile/src/app/(tabs)/deals/index.tsx` (~62) | Pass `scheduleSummary={formatDealScheduleSummary(deal.schedule)}` to `<DealCard>` | Modified (1 call site) |
| `apps/mobile/src/app/(tabs)/index.tsx` (~316) | Pass `scheduleSummary={formatDealScheduleSummary(product.schedule)}` to `<DealCard>` | Modified (1 call site) |
| `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` | Add one new `<Text>` row rendering `formatDealScheduleSummary(deal.schedule)` when defined, styled to match existing caption rows, themed via `mode` | Modified |
| `packages/api/src/routes/__tests__/branches.test.ts` | Extend the existing `GET /branches/:branchId/menu?isDeal=true — DEAL-005 scheduled window` describe block: assert `schedule` field present (shape) for a live scheduled deal, ABSENT for `unscheduledDealId`, ABSENT on the regular (non-deal) menu | Additive (new `it()` blocks in existing suite) |

**Zero migration.** No schema, DB, or column changes — `deal_schedules` is read-only in this phase.

## Public Contracts

- **NEW wire field (additive):** `GET /branches/:id/menu?isDeal=true` — each deal-product's JSON
  object MAY carry `schedule: ApiDealScheduleWindow[]` (non-empty array only; key omitted when the
  deal has zero rows). Regular (non-deal) menu responses and always-live deals (zero rows) are
  byte-identical to today — this is the AC9 no-regression bar.
  ```ts
  interface ApiDealScheduleWindow {
    startsAt: string | null;   // ISO 8601, or null (open start)
    endsAt: string | null;     // ISO 8601, or null (open end)
    recurDays: number[] | null;       // 0=Sun..6=Sat, Manila-indexed; null = non-recurring row
    recurStartTime: string | null;    // "HH:mm", Manila wall-clock, inclusive
    recurEndTime: string | null;      // "HH:mm", Manila wall-clock, exclusive
  }
  ```
- **`packages/utils` new export:** `formatDealScheduleSummary(windows: DealScheduleWindow[] | undefined): string | undefined` — pure, synchronous, no network/clock reads (all timestamps come from the input).
- **`packages/ui` `DealCard` prop surface:** new optional `scheduleSummary?: string`. Existing props (`deal`, `onPress`, `mode`, `style`, `validUntil`) unchanged.
- **No change** to `isDealScheduleLive()`, `resolveLiveDealProductIds()` (external behavior), `orders.ts`, or any auth/billing/schema surface.

## Blast Radius

- **Packages touched:** `packages/api` (2 files modified, read path only), `packages/utils` (1 new file + export), `packages/types` (1 file, additive interface), `packages/ui` (1 component + its test, additive prop), `apps/mobile` (3 screen files, additive render lines).
- **Risk class:** none of the standing high-risk classes (auth/billing/schema-migration/public-API-breaking/deploy/secrets) apply — this is a pure additive read-side annotation. `packages/api`'s menu route is a public contract, but the change is additive-only (new optional field), verified by an explicit regression assertion (AC9).
- **~10 files total**, all within one feature's existing blast radius (DEAL-005 Phase 1/2 already touched every one of these files or their siblings).

## Implementation Checklist

1. `packages/api/src/routes/lib/deal-schedule.ts` — extract the existing row-fetch-and-group loop
   (currently inline inside `resolveLiveDealProductIds`, lines ~142-165) into a private
   `loadWindowsByDeal(dbOrTx, dealProductIds): Promise<Map<string, DealScheduleWindow[]>>`. Rewire
   `resolveLiveDealProductIds()` to call it (byte-identical external behavior — re-run
   `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts` to confirm 0 regressions).
2. Same file — add `export async function resolveLiveDealSchedules(dbOrTx, dealProductIds, now): Promise<{ liveDealIds: Set<string>; schedulesByDeal: Map<string, DealScheduleWindow[]> }>` that calls `loadWindowsByDeal()` once and applies `isDealScheduleLive()` per deal, same as step 1's loop, returning both.
3. `packages/api/src/routes/lib/serializers.ts` — add `ApiDealScheduleWindow` interface near `ApiMenuProduct` (~line 198); add `schedule?: ApiDealScheduleWindow[]` field to `ApiMenuProduct`. Add optional 4th param `scheduleWindows?: DealScheduleWindow[]` to `serializeMenuProduct()`; when `scheduleWindows` is defined AND non-empty, map each `DealScheduleWindow` to `ApiDealScheduleWindow` (`Date → toISOString()`, `null → null`) and set `schedule` on the returned object; otherwise the key is omitted entirely (do not set `schedule: undefined` explicitly — omit the key so `JSON.stringify` drops it, matching the existing `isDeal`/`components` omission convention 2 lines above).
4. `packages/api/src/routes/branches.ts` (~line 207) — replace the `resolveLiveDealProductIds(...)` call with `resolveLiveDealSchedules(...)`, destructuring `{ liveDealIds, schedulesByDeal }`. At the `serializeMenuProduct(...)` call site (~line 232), pass a 4th argument: `isDealMenu ? schedulesByDeal.get(product.id) : undefined`.
5. `packages/utils/src/deal-schedule-display.ts` (new) — import `DealScheduleWindow` from `@jojopotato/types` (the interface added in step 8; do NOT import from `packages/api` — that is the wrong layering direction, an internal server module). Implement `formatDealScheduleSummary`:
   - `undefined` or `[]` → return `undefined`.
   - Find first row with `recurDays`, `recurStartTime`, `recurEndTime` all non-null → format as `"Available {dayRange}, {start12h} – {end12h}"`. Day-range grouping: sort `recurDays` ascending, group consecutive integers into runs (`0=Sun..6=Sat`), each run of length ≥2 renders `"{FirstLabel}–{LastLabel}"`, length 1 renders the single label, multiple non-adjacent runs join with `", "` (e.g. "Mon, Wed, Fri"). Reuse the day-label array `['Sun','Mon','Tue','Wed','Thu','Fri','Sat']` and a local `to12Hour(hhmm)` (same logic as `hours.ts`'s private helper, duplicated per Decision 3).
   - Else, find first row with a non-null `endsAt` → format as `"Available until {ManilaMonthDay}, {ManilaTime}"` using the fixed `+08:00` shift technique (mirror `toManilaWallClock`'s shift-then-`getUTC*` pattern) to compute the Manila month/day/hour/minute from the UTC `endsAt` instant. Month formatting: short month name array (`Jan`..`Dec`), no external date library.
   - Else → return `undefined`.
6. `packages/utils/src/index.ts` — add `export * from './deal-schedule-display';`.
7. `packages/utils/src/__tests__/deal-schedule-display.test.ts` (new) — cover: (a) undefined/empty input → undefined; (b) consecutive-day recurring row (Mon–Fri) → correct range string; (c) non-consecutive days (Mon, Wed, Fri) → comma-joined; (d) single day → single label; (e) all 7 days → "Sun–Sat" or equivalent full-week phrasing (pick one, assert it); (f) 12-hour formatting edge cases: `"00:00"` → 12:00 AM, `"12:00"` → 12:00 PM, `"08:25"` → 8:25 AM; (g) absolute-only row (no recurrence, `endsAt` set) → "Available until …" branch, asserting correct Manila month/day/time; (h) **Manila boundary-crossing regression test** (mirrors Phase 2's own): construct an `endsAt` UTC instant that is Friday 23:30 UTC (= Saturday 07:30 Manila) and assert the rendered label shows Saturday's date, not Friday's — proves the fixed-offset shift is applied, not a host-local read; (i) multi-row, non-overlapping, one recurring + one absolute → recurring wins (Decision 5 priority), output is a valid non-throwing string; (j) rows present but none informative (only an open `starts_at`, no recurrence, no `endsAt`) → undefined, does not throw.
8. `packages/types/src/menu.ts` (~41-57) — add `export interface DealScheduleWindow { startsAt: string | null; endsAt: string | null; recurDays: number[] | null; recurStartTime: string | null; recurEndTime: string | null; }` near `DealComponent`; add `schedule?: DealScheduleWindow[];` to `Product` with a comment mirroring the existing `isDeal`/`components` doc-comment style (additive, omitted for non-deal/schedule-less products).
9. `packages/ui/src/components/deal-card.tsx` — add `scheduleSummary?: string` to `DealCardProps`; destructure it in `DealCard(...)`; render one new conditional `<Text>` row (own style, e.g. `styles.scheduleSummary`, same `theme.textSecondary` color token as the existing `validUntil` row) directly below the existing `validUntil` block, gated on `scheduleSummary ? ... : null`. Both `mode`-driven tokens (no default `mode` value per the mobile-dark-mode-audit hardening — already enforced, this file already requires `mode`).
10. `packages/ui/src/components/__tests__/deal-card.test.tsx` — add 2-3 render assertions: `scheduleSummary` text renders when passed; absent (no extra text node) when omitted; renders correctly in both `mode="light"` and `mode="dark"` (matching the file's existing per-mode test pattern).
11. `apps/mobile/src/app/(tabs)/deals/index.tsx` (~62) — import `formatDealScheduleSummary` from `@jojopotato/utils`; add `scheduleSummary={formatDealScheduleSummary(deal.schedule)}` to the `<DealCard>` call (`deal` here is the raw `Product`, not the adapted `Deal` — confirm variable name at the call site during EXECUTE, it's the loop var from `deals.map(...)`).
12. `apps/mobile/src/app/(tabs)/index.tsx` (~316) — same pattern: `scheduleSummary={formatDealScheduleSummary(product.schedule)}` on the Home strip's `<DealCard>`.
13. `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` — import `formatDealScheduleSummary`; compute `const scheduleSummary = formatDealScheduleSummary(deal?.schedule);` after the existing `useDealProduct` call; render one new `<Text>` row (styled consistent with the screen's existing caption/meta text style) conditionally when `scheduleSummary` is defined, placed near the price/description block.
14. `packages/api/src/routes/__tests__/branches.test.ts` — inside the existing `describe('GET /branches/:branchId/menu?isDeal=true — DEAL-005 scheduled window', ...)` block, add: (a) an assertion that a deal with a live scheduled window (reuse an existing fixture, e.g. `openWindowDealId`) has a `schedule` array on its menu-response object matching the seeded row's fields; (b) an assertion that `unscheduledDealId` (AC3 fixture, zero rows) has NO `schedule` key at all (`expect(product.schedule).toBeUndefined()`, not just falsy); (c) an assertion on the REGULAR (non-deal) menu response that no product carries a `schedule` key (AC9 regression lock).
15. Run full gate sweep (see Verification Evidence) — `packages/api` vitest+supertest, `packages/utils` vitest, `packages/ui` jest, `apps/mobile` + `apps/admin` + `packages/api` + `packages/ui` typechecks, `pnpm format:check`.
16. Manual Agent-Probe walkthrough owed at EVL/VERIFIED time (AC5-AC7): Deals tab list, Home strip, Deal Details — light + dark mode — using a live scheduled deal seeded in dev (Phase 2's admin UI can author one, or reuse the existing seed-data pattern from `packages/api/src/db/seed/data.ts` if a scheduled deal isn't already seeded there — check during EXECUTE).

## Acceptance Criteria

Mirrors the SPEC's 9 ACs verbatim (see SPEC file for full `proven by:`/`strategy:` prose):

1. A live deal with a recurring schedule shows a correctly-grouped days+hours summary. — Fully-Automated.
2. A live deal with an absolute-only window shows a clear "available until" date/time, no recurrence text. — Fully-Automated.
3. A live deal with zero `deal_schedules` rows shows no schedule annotation, and the field is absent (not just falsy) on the wire. — Fully-Automated.
4. Displayed days/times are Manila wall-clock correct, proven by a boundary-crossing regression test. — Fully-Automated.
5. The annotation appears on the Deals tab list. — Agent-Probe.
6. The annotation appears on the Home tab's deals strip. — Agent-Probe.
7. The annotation appears on the Deal Details screen. — Agent-Probe.
8. A deal with multiple union'd rows displays a sensible, non-broken summary. — Fully-Automated.
9. No regression to existing menu consumers (regular menu, always-live deals byte-identical). — Fully-Automated.

## Test Plan (per `vc-test-coverage-plan`)

### Area: `packages/utils` — new `deal-schedule-display.ts` formatter

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-Automated | Empty/undefined input → undefined | `pnpm --filter @jojopotato/utils test deal-schedule-display` | AC3 (no-schedule deal shows nothing) at the formatter layer | Wire-level absence (covered by the `packages/api` serializer test) |
| Fully-Automated | Consecutive-day recurring grouping (Mon–Fri) | Same suite | AC1 day-range grouping quality | Non-consecutive-day grouping (separate row below) |
| Fully-Automated | Non-consecutive days (Mon, Wed, Fri) | Same suite | AC1 comma-separated fallback | — |
| Fully-Automated | Single day, all-7-days, 12-hour edge values (00:00/12:00) | Same suite | AC1 formatting completeness | — |
| Fully-Automated | Absolute-only window → "Available until …" | Same suite | AC2 | — |
| Fully-Automated | Manila boundary-crossing `endsAt` (Fri 23:30 UTC = Sat 07:30 Manila) | Same suite | AC4 — the fixed-offset shift is real, not a host-local read | Server-side `isDealScheduleLive()`/`toManilaWallClock()` correctness (already proven by Phase 2's own suite; this test proves ONLY the new client-facing display path) |
| Fully-Automated | Multi-row, non-overlapping, mixed recurring+absolute | Same suite | AC8 — non-throwing, deterministic priority | Combined-listing polish (explicitly deferred, Decision 5) |
| Fully-Automated | Rows present but none informative → undefined | Same suite | Formatter never fabricates misleading text | — |

### Area: `packages/api` — `branches.ts` / `serializers.ts` (menu read path)

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-Automated | Live scheduled deal → `schedule` field present with correct shape | `pnpm --filter @jojopotato/api test branches` (requires `docker compose up -d` + `db:migrate`) | AC1/AC2 data reaches the wire correctly | Client-side formatting correctness (covered by the `packages/utils` suite) |
| Fully-Automated | Zero-row deal (`unscheduledDealId`) → `schedule` key ABSENT (not `undefined`-valued, actually absent) | Same suite | AC3 at the wire boundary | — |
| Fully-Automated | Regular (non-deal) menu → no product carries `schedule` | Same suite | AC9 no-regression | — |
| Fully-Automated | Existing `deal-schedule.test.ts` + full `branches.test.ts`/`orders.test.ts` suites re-run green | `pnpm --filter @jojopotato/api test` | `resolveLiveDealProductIds()` refactor is behavior-preserving; `orders.ts` write path completely unaffected | — |

### Area: `packages/ui` — `DealCard` new prop

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-Automated | `scheduleSummary` renders when provided; absent when omitted; both `mode` values | `pnpm --filter @jojopotato/ui test deal-card` (jest-expo) | Prop wiring and conditional render | Real on-device visual layout/spacing (Agent-Probe) |

### Area: `apps/mobile` — 3 render call sites (Deals tab, Home strip, Deal Details)

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Agent-Probe | Deals tab list shows the annotation on a live scheduled deal, nothing on an unscheduled deal, light + dark mode | Manual walkthrough — SPEC AC5 | The full pipeline renders correctly end-to-end on-device | — |
| Agent-Probe | Home strip shows the same annotation | Manual walkthrough — SPEC AC6 | — | — |
| Agent-Probe | Deal Details screen shows the fullest annotation | Manual walkthrough — SPEC AC7 | — | — |

**No RN component/E2E test runner exists in `apps/mobile`** (standing project-wide gap, documented in `process/context/tests/all-tests.md`) — the 3 render-site rows above are Agent-Probe by necessity, not a shortcut. Known-Gap is NOT used for any AC in this plan — every AC has either a Fully-Automated or an explicitly-scoped Agent-Probe proof.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `packages/utils` vitest: day-grouping (consecutive/non-consecutive/single/all-7) + 12h edge cases | Fully-Automated | AC1 |
| `packages/utils` vitest: absolute-window "Available until" branch | Fully-Automated | AC2 |
| `packages/api` vitest+supertest: `unscheduledDealId` → no `schedule` key on wire | Fully-Automated | AC3 |
| `packages/utils` vitest: `undefined`/`[]` input → `undefined` | Fully-Automated | AC3 |
| `packages/utils` vitest: Manila boundary-crossing `endsAt` (Fri 23:30 UTC / Sat 07:30 Manila) | Fully-Automated | AC4 |
| Agent-Probe: Deals tab list walkthrough, light + dark | Agent-Probe | AC5 |
| Agent-Probe: Home strip walkthrough, light + dark | Agent-Probe | AC6 |
| Agent-Probe: Deal Details walkthrough, light + dark | Agent-Probe | AC7 |
| `packages/utils` vitest: 2 non-overlapping rows, mixed shapes → non-throwing valid output | Fully-Automated | AC8 |
| `packages/api` full suite re-run green (`branches.test.ts`, `orders.test.ts`, `deal-schedule.test.ts`) + regular-menu no-`schedule`-key assertion | Fully-Automated | AC9 |
| `packages/ui` jest: `DealCard` `scheduleSummary` prop render/absence, both modes | Fully-Automated | AC5/AC6 (component layer, precondition for the Agent-Probe screen walkthroughs) |
| 4 package typechecks clean (`api`, `utils`, `ui`, `mobile`) + `pnpm format:check` | Fully-Automated | Regression guard (all ACs — no type or format drift) |

## Test Infra Improvement Notes

(none identified yet)

## Phase Completion Rules

- **CODE DONE** — all Fully-Automated gates above are green (11 rows), typechecks clean across
  `packages/api`/`packages/utils`/`packages/ui`/`apps/mobile`, `pnpm format:check` clean, and the
  full `packages/api` regression suite (`branches.test.ts`, `orders.test.ts`,
  `deal-schedule.test.ts`) is green with zero new failures.
  This state does NOT require the Agent-Probe walkthroughs (AC5-AC7) to be performed — code-only
  completion is legitimate to reach and report as CODE DONE.
- **VERIFIED** — CODE DONE, PLUS the AC5-AC7 manual Agent-Probe walkthrough (Deals tab, Home strip,
  Deal Details — light + dark mode) has been performed by the user and passed. Only at this point
  does the task folder move from `active/` to `completed/`.
- Do not mark this plan VERIFIED, and do not archive the task folder, until the Agent-Probe
  walkthrough is explicitly confirmed performed and passed — matching this feature's own
  established precedent (DEAL-005 Phase 1 was VERIFIED only after its walkthrough passed; Phase 2
  is still held at CODE DONE pending exactly this kind of confirmation).
- **Status as of 21-07-26 final UPDATE PROCESS pass: ✅ VERIFIED.** All Fully-Automated gates
  independently re-confirmed green; source + SPEC/PLAN + the nav-entry fix committed (`f0685f9`,
  `83fc7f4`, `ab3d916`). The AC5 nav-entry blocker (Deals-tab list screen unreachable) was fixed by
  adding a "See all" entry to the Home tab's "Deals & offers" header (commit `ab3d916`) — see
  `deals-list-screen-no-nav-entry_NOTE_21-07-26.md`, now marked RESOLVED. The AC5-AC7 Agent-Probe
  walkthrough (Deals tab, Home strip, Deal Details — light + dark) was performed and PASSED by the
  user this session. Task folder moved from `active/` to `completed/`. See the co-located
  `deal-005-mobile-surfacing_REPORT_21-07-26.md` for full closeout detail.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/deal-005-mobile-surfacing_21-07-26/deal-005-mobile-surfacing_PLAN_21-07-26.md` (this file).
2. **Last completed phase or step:** PLAN written; not yet validated.
3. **Validate-contract status:** pending — see placeholder section below.
4. **Supporting context files loaded:** `process/context/all-context.md` (DEAL-005 Phase 1/2 entries), `process/features/admin-dashboard/completed/deal-005-scheduled-deals_20-07-26/`, `process/features/admin-dashboard/active/deal-005-recurring-schedules_20-07-26/` (Phase 2, read for `deal_schedules` schema/semantics and the Manila-wall-clock technique), this task folder's SPEC.
5. **Next step for a fresh agent picking up mid-execution:** run VALIDATE against this plan; if PASS/CONDITIONAL-accepted, execute checklist steps 1-16 in order (steps 1-2 must land before step 4; steps 5-8 can run in parallel with steps 1-4 since the formatter has no dependency on the server change; steps 9-10 before 11-13; step 14 after step 4).

## Validate Contract

Status: PASS
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal score 1/7 (only S7 borderline — 10 files, all within one feature's already-established blast radius from Phase 1/2; no schema/auth/billing/API-breaking surface, no 3+ phase program, no 3+ competing directions). A single vc-execute-agent implementing checklist steps 1-16 in the plan's own stated order is the correct fit — this is a linear, well-sequenced, single-feature change, not a fan-out.

## I. Two-Layer Fan-Out Findings

### Layer 1 — dimension checks

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

- **Infra fit — PASS.** No container/deploy/runtime surface touched. Zero migration (verified:
  `deal_schedules` already carries all 5 columns this phase reads —
  `starts_at`/`ends_at`/`recur_days`/`recur_start_time`/`recur_end_time` — from Phase 1/2;
  confirmed by reading `packages/api/src/routes/lib/deal-schedule.ts`). Test commands in the plan
  (`pnpm --filter @jojopotato/utils test deal-schedule-display`, `pnpm --filter @jojopotato/api
  test branches`, `pnpm --filter @jojopotato/ui test deal-card`) match this repo's real,
  documented runner/filename-filter convention (`process/context/tests/all-tests.md`) — not
  invented commands.
- **Test coverage — PASS.** All 4 test tiers are used correctly: Fully-Automated for every
  formatter/serializer/wire-shape claim, Agent-Probe ONLY for the 3 on-device render sites (no RN
  E2E/component-visual runner exists — a real, documented, project-wide gap, not a shortcut).
  Known-Gap is not used anywhere, matching the SPEC's own AC list. `packages/utils` genuinely has
  a working vitest runner (39/39 tests pre-existing, verified live) — the plan is not proposing
  Agent-Probe for logic that is actually automatable.
- **Breaking changes — PASS, confirmed by direct inspection, not assumption.**
  - `serializeMenuProduct()`'s existing `isDeal`/`components` omit-when-undefined convention
    (verified read at `packages/api/src/routes/lib/serializers.ts` ~198-214, ~328-360) is the
    exact same pattern the plan reuses for the new `schedule` field — real precedent, not a new
    invention.
  - `apps/mobile/src/lib/api-client.contract.ts`'s `satisfies Product` compile-time wire-guard
    was read directly: `schedule` being OPTIONAL means the existing `WIRE_PRODUCT` literal (which
    omits it) still satisfies `Product` — this guard will not turn red. Confirmed, not inferred.
  - `getJson<T>()` (`apps/mobile/src/lib/api-client.ts`) does a bare `res.json() as T` with zero
    runtime schema stripping/validation — the new field passes through to the client untouched,
    consistent with the plan's assumption.
  - `orders.ts`'s call site of `resolveLiveDealProductIds` (the write path) was read directly and
    confirmed untouched by the plan's refactor — the function's public signature and behavior are
    byte-identical; only a new sibling `resolveLiveDealSchedules()` is added. No shared internal
    state or query plan changes leak into the old function's behavior.
- **Security surface — PASS (trivial).** No auth/billing/schema/secrets/trust-boundary surface.
  Read-only, additive, informational display data. None of the 6 standing high-risk classes apply.

### Layer 2 — per-section feasibility

| Layer 2 sections | Status |
|---|---|
| A — `deal-schedule.ts` refactor + new `resolveLiveDealSchedules` | PASS |
| B — `serializers.ts` additive `schedule` field | PASS |
| C — `packages/utils` new formatter | CONCERN (fixed in plan text this pass) |
| D — `packages/types`/`packages/ui` additive surface | PASS |
| E — 3 mobile render call sites | PASS |

**Section A — mechanical feasibility: PASS.** Confirmed by direct source read: the row-fetch loop
(lines ~142-165 of `deal-schedule.ts`) is a clean, self-contained block extractable into a private
`loadWindowsByDeal()` helper with no external side effects. `orders.ts` and `branches.ts`'s only
inbound reference to `resolveLiveDealProductIds` are both accounted for (grep-confirmed: exactly 2
call sites in production code, `branches.ts:207` and `orders.ts:281` — the plan correctly redirects
only the former). No gaps or conflicts found.

**Section B — mechanical feasibility: PASS.** `ApiMenuProduct`/`serializeMenuProduct()`'s existing
shape and the plan's proposed additive 4th param + omit-when-absent convention match the file's own
established pattern exactly (verified against the real `isDeal`/`components` precedent 2 fields
above). Highest-risk edit: forgetting to gate the 4th-arg pass at the `branches.ts` call site behind
`isDealMenu ? ... : undefined` (a `schedulesByDeal.get(...)` call on the regular, non-deal menu path
would either be undefined naturally since `schedulesByDeal` is only populated `if (isDealMenu)`, or
would need the same explicit gate as `components` uses) — the plan already specifies this gate
explicitly at checklist step 4 ("`isDealMenu ? schedulesByDeal.get(product.id) : undefined`"),
mitigating the risk as written.

**Section C — mechanical feasibility: PASS. Gap found (now fixed in plan text): the plan's original
Decision 3 / checklist step 5 said `packages/utils/src/deal-schedule-display.ts` should define a
*local, duplicated* `DealScheduleWindow`-shaped type, citing "`packages/utils`'s existing
zero-inbound-dependency convention" as the reason not to import the shared type from
`@jojopotato/types`.** Direct inspection shows this premise is factually wrong: `packages/utils`
already depends on `@jojopotato/types` (`package.json` dependency) and already imports types from it
in 4 existing files (`order-display.ts`, `product-options.ts`, `discount.ts`, `reorder.ts`) — it is
not a zero-inbound-dependency leaf package. The "do NOT import from `packages/api`" half of the
original guidance is correct and unchanged (that would be the wrong layering direction — a
server-internal module). **Applied as a Plan Update (P1) directly to Decision 3 and checklist step
5** — the formatter now imports the shared `DealScheduleWindow` interface from `@jojopotato/types`
(added in checklist step 8) instead of duplicating it. This closes a real drift risk (two
structurally-identical interfaces of the same name in two packages silently diverging over time) at
zero cost — mechanically low-risk, does not change any test, command, or behavior in the plan.
Severity was CONCERN-tier (not blocking); resolved in-plan, so it does not count against the net
gate.

Minor observation, not a gap requiring plan changes (documented for EXECUTE awareness, see
Execute-Agent Instruction E1 below): the day-range grouping algorithm operates on `recur_days`
(0=Sun..6=Sat) sorted ascending with linear-run grouping — this does not treat Saturday(6)/Sunday(0)
as adjacent (no wraparound), so a weekend-only deal (Sat+Sun) would render as "Sun, Sat" rather than
a collapsed "Sat–Sun" range. This is not a regression or a new bug class: `packages/utils/src/hours.ts`'s
existing `formatOpeningHours` (the explicit quality precedent AC1 cites) has the exact same class of
limitation on a *different* day pair (its Mon-first array does not wrap Sun→Mon either). The output
is still correct and readable, just not maximally collapsed for that one edge case — AC1's bar
("grouped in a readable way... matching the display quality already established") is met. No plan
change required; flagged as an optional test-coverage improvement only.

**Section D — mechanical feasibility: PASS.** `DealCard`'s `mode: ThemeMode` prop was confirmed
(direct read) to already be required with no default — the plan's checklist step 9 claim that this
file "already requires `mode`" (matching the mobile-dark-mode-audit hardening convention) is
accurate, not assumed. `validUntil`'s only other consumer (`(tabs)/branch/index.tsx:254`, the
legacy `offers`-model branch-detail deals section) was confirmed live and reads exactly as the plan
describes — Decision 6's reasoning for a NEW `scheduleSummary` prop instead of reusing `validUntil`
is correct and non-obvious (reusing `validUntil` would have produced a double-labeled
"Valid until: Available Mon–Fri, …" string on that other screen). This is the single best catch in
the plan — verified, not just plausible.

**Section E — mechanical feasibility: PASS.** All 3 call-site loop-variable names were confirmed by
direct read against the real files, not assumed: `(tabs)/deals/index.tsx` uses `deal` (line ~62,
`deals.map((deal) => ...)`), `(tabs)/index.tsx` uses `product` (line ~316,
`deals.map((product) => ...)`), and `(tabs)/deals/deal/[dealId].tsx` derives a single `deal` from
`useDealProduct(dealId)`. All three match the plan's checklist items 11-13 exactly. Highest-risk
edit: none — these are single-line additive prop/JSX insertions with no control-flow change.

## II. Net Gate Derivation

**Totals: 0 FAILs / 1 CONCERN (resolved in-plan via Plan Update P1) / 8 PASSes**

**→ Net Gate: PASS**

No FAILs found anywhere across Layer 1 or Layer 2. The single CONCERN (Section C's type-duplication
premise) was corrected directly in the plan text this pass (Decision 3, checklist step 5) — it does
not carry forward as an open gap. Every developed behavior in this plan (day-grouping, 12h
formatting, absolute-window formatting, Manila boundary-crossing correctness, wire-field
presence/absence, multi-row priority, no-regression) has a real Fully-Automated proving test — no
vacuous-green risk (per the Net-gate vacuous-green ban). The 3 Agent-Probe rows (AC5-AC7) are a
legitimate, pre-existing, documented tier for on-device rendering, not a disguised Known-Gap on
automatable logic.

## III. Test Coverage Plan

The plan's own "Test Plan" and "Verification Evidence" sections (already written per
`vc-test-coverage-plan`'s waterfall) are adopted verbatim as this contract's test gate table — they
were independently checked against real source/test files during this VALIDATE pass (see Layer 1/2
findings above) and found accurate. Reproduced here in the required 5-column form:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Recurring-schedule live deal shows correctly-grouped days+hours | Fully-Automated | `pnpm --filter @jojopotato/utils test deal-schedule-display` | A |
| AC2 | Absolute-only-window live deal shows "Available until …", no recurrence text | Fully-Automated | `pnpm --filter @jojopotato/utils test deal-schedule-display` | A |
| AC3 | Zero-row deal shows no annotation; wire field is ABSENT not falsy | Fully-Automated | `pnpm --filter @jojopotato/utils test deal-schedule-display` + `pnpm --filter @jojopotato/api test branches` | A |
| AC4 | Manila wall-clock correctness across a UTC day-boundary crossing | Fully-Automated | `pnpm --filter @jojopotato/utils test deal-schedule-display` | A |
| AC5 | Deals tab list shows the annotation, light+dark | Agent-Probe | Manual walkthrough | D |
| AC6 | Home strip shows the annotation, light+dark | Agent-Probe | Manual walkthrough | D |
| AC7 | Deal Details shows the annotation, light+dark | Agent-Probe | Manual walkthrough | D |
| AC8 | Multi-row union'd schedule produces sensible, non-throwing output | Fully-Automated | `pnpm --filter @jojopotato/utils test deal-schedule-display` | A |
| AC9 | No regression to regular menu / always-live deals (byte-identical) | Fully-Automated | `pnpm --filter @jojopotato/api test` (full suite: `branches.test.ts`, `orders.test.ts`, `deal-schedule.test.ts`) | A |
| — | `DealCard` `scheduleSummary` prop render/absence, both `mode` values | Fully-Automated | `pnpm --filter @jojopotato/ui test deal-card` | A |
| — | Regression guard — no type/format drift across all 4 touched packages | Fully-Automated | `pnpm typecheck && pnpm format:check` | A |

gap-resolution legend: A — proven now (gate passes in this cycle). D — backlog test-building stub
(named residual; keep-active; continue) — used here for AC5-AC7 because the residual (no RN
component/E2E runner) is a standing, already-tracked, project-wide gap
(`process/context/tests/all-tests.md` §Known Gaps), not new to this plan.

Legacy line form (retained for existing validate-contract consumers):
- `packages/utils` formatter: Fully-automated: `pnpm --filter @jojopotato/utils test deal-schedule-display`
- `packages/api` menu/branches wire shape: Fully-automated: `pnpm --filter @jojopotato/api test branches` (requires `docker compose up -d` + `db:migrate`, or the native Postgres instance per `all-tests.md`'s dev-machine note)
- `packages/api` full regression suite (write-path untouched proof): Fully-automated: `pnpm --filter @jojopotato/api test`
- `packages/ui` DealCard prop: Fully-automated: `pnpm --filter @jojopotato/ui test deal-card`
- Cross-package regression guard: Fully-automated: `pnpm typecheck` + `pnpm format:check`
- Deals tab / Home strip / Deal Details on-device rendering, light+dark: Agent-probe: manual walkthrough (AC5-AC7), owed at VERIFIED time per the plan's own Phase Completion Rules

## What this coverage does NOT prove

- The Fully-Automated `packages/utils` suite proves the FORMATTER's output is correct given a
  window shape as input. It does NOT prove the on-screen typography, spacing, truncation, or
  color-contrast of the rendered caption row on a real device — that is exactly what AC5-AC7's
  Agent-Probe walkthrough is for.
- The `packages/api` wire-shape test proves the field is present/absent/correctly-shaped on a
  fixture built with `starts_at`/`ends_at` only (no recurrence) — it does NOT independently
  re-prove Manila recurrence correctness at the server layer (that is Phase 2's own suite,
  untouched and unaffected by this plan) nor does it prove the CLIENT correctly interprets a
  recurring row's wire shape (that is the `packages/utils` suite's job).
- AC8's multi-row test proves the formatter does not crash or silently do something wrong on
  multi-row input and picks a deterministic priority — it does NOT prove that priority is the
  *ideal* UX choice when two rows are both currently contributing to liveness (already documented
  as an accepted, descoped limitation in the plan's Decision 5 and the SPEC's own AC8 text, tied to
  the already-tracked `deal-005-one-window-per-deal` backlog note).
- No test in this plan proves anything about the fetch-on-focus staleness window (a card lingering
  briefly after its schedule closes) — explicitly out of scope per the plan's Decision 1 and the
  `deal-005-mobile-expiry-refetch` backlog note.

## IV. Proposed Plan Updates (applied this pass)

| # | What changed | Where in plan | Why |
|---|---|---|---|
| P1 | `packages/utils/src/deal-schedule-display.ts`'s input type now imports `DealScheduleWindow` from `@jojopotato/types` instead of duplicating a local structurally-identical type; corrected the inaccurate "zero-inbound-dependency" rationale | Decision 3, Implementation Checklist step 5 | `packages/utils` already imports types from `@jojopotato/types` in 4 other files — the original rationale for duplication was factually wrong; importing removes a drift risk at zero cost |

## Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Optional, non-blocking: when writing the `packages/utils/__tests__/deal-schedule-display.test.ts` cases from checklist step 7, consider adding one extra case for a Saturday+Sunday (weekend) `recurDays` set and assert whatever output the linear (non-wrapping) grouping algorithm actually produces (e.g. "Sun, Sat" rather than a collapsed "Sat–Sun"). This documents the known non-wraparound edge case as an intentional, asserted behavior rather than an untested corner. Do not change the grouping algorithm to add wraparound support — that is out of scope for this plan. | Writing checklist step 7's test file |
| E2 | Confirm at the `branches.ts` call site (checklist step 4) that `schedulesByDeal.get(product.id)` is passed ONLY inside the `isDealMenu ? ... : undefined` ternary exactly as written in the plan — do not simplify to a bare `schedulesByDeal.get(product.id)` even though `schedulesByDeal` would be an empty Map on the regular-menu path (the explicit ternary is defense-in-depth matching the existing `components` field's own gating pattern one line above it, and keeps both fields visually symmetric for the next reader). | Editing `branches.ts` ~line 232 |

## Backlog Artifacts

None new. Existing relevant backlog notes (already filed, unaffected by this plan):
`deal-005-mobile-expiry-refetch_NOTE_21-07-26.md`, `deal-005-one-window-per-deal_NOTE_20-07-26.md`.

## Dimension findings

- Infra fit: PASS — zero migration, real documented test commands, no runtime/deploy surface.
- Test coverage: PASS — correct tier assignment on every AC, Known-Gap unused, Agent-Probe used only where genuinely required (no RN runner).
- Breaking changes: PASS — additive-only wire field, confirmed against the real compile-time contract guard (`api-client.contract.ts`) and the real client fetch wrapper (no runtime stripping).
- Security surface: PASS — no high-risk class present; read-only informational display.
- Section A feasibility (deal-schedule.ts refactor): PASS — mechanically clean extraction, write path (`orders.ts`) confirmed untouched.
- Section B feasibility (serializers.ts additive field): PASS — matches an established, real precedent in the same file.
- Section C feasibility (packages/utils formatter): PASS (after Plan Update P1 — see above).
- Section D feasibility (types/ui additive surface): PASS — `DealCard`'s required-`mode` claim and the `validUntil` collision risk were both independently confirmed against real source.
- Section E feasibility (3 mobile render sites): PASS — all loop-variable names confirmed against real source, zero control-flow risk.

Open gaps: none unresolved. AC5-AC7 Agent-Probe walkthroughs are a documented, standing, tracked
residual (not a gap introduced by this plan) — per the plan's own Phase Completion Rules, the task
folder stays in `active/` and is not marked VERIFIED until they are performed and pass.

What this coverage does NOT prove: see the dedicated section above (required until C3 is
implemented — temporary C3 mitigation).

Gate: PASS (no FAILs, plan updated)
Accepted by: n/a — PASS gate, no CONDITIONAL concerns requiring explicit acceptance


## Autonomous Goal Block

```
SESSION GOAL: DEAL-005 Phase 3 — surface live deal schedules (days/hours) on the Deals tab, Home strip, and Deal Details, additive-only, no change to which deals are shown.
Charter + umbrella plan: N/A — single plan, not part of a phase program.
Autonomy: standard /goal autonomous execution rules — self-decide at V5-equivalent gates; CONDITIONAL findings apply-and-proceed; BLOCKED items go to backlog and continue; irreversible/outward-facing actions without explicit contract instruction are a hard stop.
Hard stop conditions / safety constraints:
- Do not change `isDealScheduleLive()`, `resolveLiveDealProductIds()`, `orders.ts`, or any menu-filter/live-check logic — those are correct today and frozen (SPEC Out of Scope).
- Do not reuse `DealCard`'s `validUntil` prop for the new schedule text — it is load-bearing for the legacy `offers`-model deal display on `(tabs)/branch/index.tsx` (Decision 6).
- All Manila day/time formatting on `recur_days`/`recur_start_time`/`recur_end_time` does ZERO timezone math (already Manila wall-clock); ONLY `ends_at` needs the fixed +08:00 shift technique (Decision 2).
- Do not mark this plan VERIFIED or move the task folder to `completed/` until the AC5-AC7 Agent-Probe walkthrough (Deals tab, Home strip, Deal Details — light + dark) is explicitly confirmed performed and passed by the user.
Test gates:
- pnpm --filter @jojopotato/utils test deal-schedule-display
- pnpm --filter @jojopotato/api test branches
- pnpm --filter @jojopotato/api test (full regression — orders.ts write-path unaffected proof)
- pnpm --filter @jojopotato/ui test deal-card
- pnpm typecheck && pnpm format:check
Validate contract: inline in this plan file (## Validate Contract section above) — Gate: PASS.
Next phase: EXECUTE — run Implementation Checklist steps 1-16 in the plan's stated order (steps 1-2 before step 4; steps 5-8 can run in parallel with 1-4; steps 9-10 before 11-13; step 14 after step 4).
Execute start: `pnpm --filter @jojopotato/utils test deal-schedule-display` (once written) | AC5-AC7 Agent-Probe walkthrough owed at VERIFIED time | high-risk pack: no (no high-risk class present).
```
