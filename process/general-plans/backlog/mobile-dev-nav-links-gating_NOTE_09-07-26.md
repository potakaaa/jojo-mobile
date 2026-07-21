---
name: plan:mobile-dev-nav-links-gating
description: "Gate the temporary Dev nav links on placeholder tab-root screens behind __DEV__ before any of them could ship to production"
date: 09-07-26
feature: general
---

# Backlog: Gate Dev Nav Links Behind `__DEV__`

## What

The 4 placeholder tab-root screens added by `finalize-navigation-shell` —
`apps/mobile/src/app/(tabs)/order/index.tsx`, `rewards/index.tsx`, `branches/index.tsx`,
`account/index.tsx` — each rendered a couple of small, clearly-labeled "Dev: ..." navigation links
(e.g. "Dev: View Product 123", "Dev: View Cart", "Dev: View Coupons", "Dev: View Branch bgc-1") so
nested stacks and back-navigation could be manually tapped through during development. These links
were **hardcoded and rendered unconditionally** — not gated behind `__DEV__`, an env flag, or any
other check.

**Update 13-07-26 (`pickup-order-flow`):** `order/index.tsx`, `branches/index.tsx`, and
`order/confirmation/[orderId].tsx` were replaced with real business UI and their un-gated `Dev:`
links removed entirely (confirmed by a grep gate: 0 matches). **Remaining scope is narrowed to
`rewards/index.tsx` only** (`Dev: View Coupons`) and, unverified in this pass, `account/index.tsx`
— both tabs are still `<ComingSoon>` placeholders (see
`process/context/all-context.md` §Current Implementation State).

## Why this matters

If either remaining placeholder screen (`rewards/index.tsx`, `account/index.tsx`) ships to
production before being replaced by real feature UI, its un-gated "Dev: ..." link(s) would ship too
and be visible to real users. This was flagged as a real gap during the `finalize-navigation-shell`
EXECUTE session (user-raised, intentionally left unfixed at that time).

## Fix sketch

Wrap each remaining `Dev: ...` link/button in `if (__DEV__) { ... }` (or extract a small
`<DevOnly>{children}</DevOnly>` wrapper component reused across both remaining screens) so the
links compile out of production builds automatically. Low-risk, single-file-per-screen change —
likely QUICK FIX lane scope once picked up, or folded into whichever plan replaces
`rewards/index.tsx` or `account/index.tsx` with real feature UI.

## Status

Open — narrowed scope. `order/`, `branches/`, and `order/confirmation/[orderId].tsx` are resolved
(no `Dev:` links remain, verified by grep). `rewards/index.tsx` still has one un-gated `Dev: View
Coupons` link; `account/index.tsx` was not touched by `pickup-order-flow` and should be re-checked
when picked up. This remains a production-leak risk for the two remaining placeholder tabs — must
be revisited before either `rewards/` or `account/` first ships real production UI, whichever
comes first. Do not silently drop.
