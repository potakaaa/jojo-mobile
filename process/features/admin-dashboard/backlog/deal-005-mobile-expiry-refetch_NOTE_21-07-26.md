---
name: note:deal-005-mobile-expiry-refetch
description: "Mobile deal cards linger past a recurring window's daily end-time until a manual refocus — fold the auto-drop / schedule surfacing into Phase 3, not Phase 2"
date: 21-07-26
feature: admin-dashboard
---

# Mobile deals don't auto-drop when a recurring window closes (defer to DEAL-005 Phase 3)

**Status:** accepted, deferred to Phase 3 (mobile surfacing). NOT a Phase 2 bug, NOT a server
correctness bug.

## TL;DR

Observed during Phase 2 verification: a recurring deal stayed visible/tappable in the mobile app
after its daily `recur_end_time` had passed. Diagnosis: the **server is correct** — the menu API
(`branches.ts` → `resolveLiveDealProductIds`) drops the deal from a fresh fetch, and order
placement (`orders.ts`) re-validates and would reject it. The lingering card is **stale
react-query cache**: the mobile deals screen uses ~30s `staleTime` + fetch-on-focus, no polling
(the app-wide convention), so a window that closes while the screen is open/backgrounded isn't
reflected until a refetch (refocus / restart).

## Why this belongs in Phase 3, not Phase 2

- Phase 2's design keeps mobile schedule-blind (D2: out-of-window = hidden, zero window data on
  the customer wire). There is nothing schedule-aware to fix on mobile within Phase 2 scope.
- Phase 3 is exactly the mobile schedule-surfacing phase ("Starts Friday" affordances). Whatever
  we do about an expired card — a `refetchInterval` on the deals query to auto-drop it, or a
  richer "starts soon / off now" state — is the same decision. Make it once, there.

## What Phase 3 should decide

1. Whether deal cards should auto-drop when a window boundary passes (add `refetchInterval`) or
   keep the current fetch-on-focus behavior.
2. Whether to surface recurring state to the customer at all (this is a wire-contract change —
   D2 currently sends no window data), e.g. "Available Mon–Fri 8am–8pm" or a countdown.

No action owed before Phase 3 is planned.
