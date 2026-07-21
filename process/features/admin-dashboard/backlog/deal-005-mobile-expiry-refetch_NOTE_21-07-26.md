---
name: note:deal-005-mobile-expiry-refetch
description: "Mobile deal cards linger past a recurring window's daily end-time until a manual refocus — fold the auto-drop / schedule surfacing into Phase 3, not Phase 2"
date: 21-07-26
feature: admin-dashboard
---

# Mobile deals don't auto-drop when a recurring window closes (post-DEAL-005-Phase-3 follow-up)

**Status:** OPEN — accepted/deferred. Phase 3 (mobile surfacing) is now ✅ VERIFIED but
deliberately kept the app-wide fetch-on-focus behavior (it added read-only schedule captions, not
an auto-drop). So the surviving follow-up is narrowed to just the auto-refetch/expiry question
below. NOT a Phase 2 bug, NOT a server correctness bug.

## TL;DR

Observed during Phase 2 verification: a recurring deal stayed visible/tappable in the mobile app
after its daily `recur_end_time` had passed. Diagnosis: the **server is correct** — the menu API
(`branches.ts` → `resolveLiveDealProductIds`) drops the deal from a fresh fetch, and order
placement (`orders.ts`) re-validates and would reject it. The lingering card is **stale
react-query cache**: the mobile deals screen uses ~30s `staleTime` + fetch-on-focus, no polling
(the app-wide convention), so a window that closes while the screen is open/backgrounded isn't
reflected until a refetch (refocus / restart).

## What Phase 3 settled, and what it left open

- **Settled:** Phase 3 added read-only schedule captions to the customer wire (the D2 stance
  relaxed to "annotate currently-live deals"), so "surface recurring state to the customer" is
  done.
- **Still open (this note):** whether deal cards should auto-drop the moment a window boundary
  passes (add a `refetchInterval` to the deals query) or keep the current app-wide fetch-on-focus
  behavior. Phase 3 chose fetch-on-focus to stay consistent with every other screen; a card can
  therefore linger past its daily `recur_end_time` until the next refetch. Server enforcement is
  unaffected — placement re-validates and rejects.

No action owed unless a product decision calls for real-time auto-drop; it would be its own small
plan.
