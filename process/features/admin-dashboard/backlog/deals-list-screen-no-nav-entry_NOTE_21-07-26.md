---
name: note:deals-list-screen-no-nav-entry
description: "The standalone Deals-tab list screen ((tabs)/deals/index.tsx) has no reachable navigation entry point anywhere in the app — the Home strip bypasses it entirely"
date: 21-07-26
feature: admin-dashboard
---

# Deals-tab list screen has no navigation entry point

**STATUS: RESOLVED (21-07-26, same day).** Fixed by commit `ab3d916` — a "See all" entry was added
to the Home tab's "Deals & offers" header, linking to `/(tabs)/deals`. This unblocked DEAL-005
Phase 3's AC5 walkthrough, which was subsequently performed and passed by the user. Kept for
history; no further action needed.

**Priority:** Low-Medium (pre-existing UX gap, surfaced while scoping DEAL-005 Phase 3's AC5
Agent-Probe walkthrough — not a regression, not introduced by that phase).

## Problem

`apps/mobile/src/app/(tabs)/deals/index.tsx` — the standalone Deals-tab list screen (list of all
deal products at the current branch) — is not reachable from anywhere in the running app.

- `router.push('/(tabs)/deals')` appears only in two code COMMENTS
  (`deals/index.tsx:19`, `deals/_layout.tsx:4`) describing how the screen is "reached" — no actual
  call site exists (confirmed by `grep -rn "(tabs)/deals'" apps/mobile/src`, 21-07-26).
- The Home tab's "Deals & offers" strip (`(tabs)/index.tsx:191`) navigates DIRECTLY to
  `/(tabs)/deals/deal/[dealId]` (Deal Details) for each card — it never routes through the list
  screen.
- The Deals tab is not one of the 5 bottom-nav tabs (Home, Order, Rewards, Branches, Account —
  confirmed against the PRD nav order in `process/context/all-context.md`) and no other screen
  links to it.

## Root cause

The list screen was likely built as a planned navigation target (Deals section from the PRD) but
the actual wiring only ever shipped the Home-strip → Deal-Details shortcut path
(`deals-api-integration_13-07-26` — DEAL-001/002/003). The list screen itself was never given a
"See all" / entry-point link from Home, nor a tab-bar/nav-card entry.

## Discovered by

DEAL-005 Phase 3 (mobile surfacing of live deal schedules, issue #127) — while scoping its AC5
Agent-Probe walkthrough ("annotation appears on the Deals tab list"), confirmed the screen cannot
currently be reached to walk that AC. AC6 (Home strip) and AC7 (Deal Details) remain reachable and
unaffected.

## Fix options

1. Add a "See all deals" / entry link from the Home tab's "Deals & offers" strip header to
   `/(tabs)/deals`.
2. Add a nav card or menu entry elsewhere (e.g. from the Order tab's category browsing) pointing at
   the list screen.
3. Decide the list screen is genuinely redundant now that the Home strip covers the common case,
   and either delete it or repurpose it (e.g. "View all deals for this branch" when the Home strip
   is truncated).

Resolved via option 1 (commit `ab3d916` — a "See all" entry on the Home tab's "Deals & offers"
header). Options 2 and 3 above are recorded only as the alternatives considered; no further action
is owed. This note is kept for history.
