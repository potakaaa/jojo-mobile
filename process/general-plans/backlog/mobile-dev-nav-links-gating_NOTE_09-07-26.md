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
`account/index.tsx` — each render a couple of small, clearly-labeled "Dev: ..." navigation links
(e.g. "Dev: View Product 123", "Dev: View Cart", "Dev: View Coupons", "Dev: View Branch bgc-1") so
nested stacks and back-navigation could be manually tapped through during development. These links
are currently **hardcoded and render unconditionally** — they are not gated behind `__DEV__`, an env
flag, or any other check.

## Why this matters

If any of these 4 placeholder screens ship to production before being replaced by real feature UI
(Menu/Cart/Checkout/Branches business screens), the "Dev: ..." links would ship too and be visible
to real users. This was flagged as a real gap during the `finalize-navigation-shell` EXECUTE session
(user-raised, intentionally left unfixed — no code changes were in scope for that session's UPDATE
PROCESS pass).

## Fix sketch

Wrap each `Dev: ...` link/button in `if (__DEV__) { ... }` (or extract a small
`<DevOnly>{children}</DevOnly>` wrapper component reused across all 4 screens) so the links compile
out of production builds automatically. Low-risk, single-file-per-screen change — likely QUICK FIX
lane scope once picked up, or folded into whichever plan replaces a given placeholder screen with
real feature UI.

## Status

Open — not yet fixed. This is a production-leak risk, not a dev/preview-only cleanup item: the
placeholder tab-root screens (`order/`, `rewards/`, `branches/`, `account/`) live in the shipped
navigation shell, so their unconditional "Dev: ..." links ship to real users the moment any of
those screens reaches a production build without first being gated or replaced. Must be revisited
before any of `order/`, `rewards/`, `branches/`, or `account/` first ships real production UI —
whichever screen gets replaced first, or before a production build that still contains the
placeholder, whichever comes first. Do not silently drop.
