---
name: note:nav-tab-bar-escape-hatch-defense
description: "Out-of-scope defense-in-depth: FloatingTabBar could re-anchor back-stack for hidden top-level routes; deferred from NAV-006"
date: 20-07-26
metadata:
  node_type: memory
  type: note
  status: backlog
---

# NAV — Tab-Bar Escape-Hatch Defense-in-Depth (deferred from NAV-006)

**Origin:** NAV-006 INNOVATE decision D3. Out of scope for the NAV-006 fix; recorded here.

## What

`apps/mobile/src/components/floating-tab-bar.tsx` is the custom tab bar that gates which
routes render a tab button (its `ICONS` route allowlist) and hides top-level "hidden"
routes (product, branch, tracking, cart, notifications, etc.). NAV-006 fixes the
back-stack doubling at the ROUTE level (static-index anchor + centralized nav helper),
which is the correct and sufficient fix.

The tab bar itself is NOT part of that fix and was deliberately left untouched.

## Why it's noted

As more hidden top-level routes are added, there is a latent maintenance risk: a hidden
route added WITHOUT the static-index anchor pattern will silently reintroduce the
back-stack doubling bug (NAV-004/005/006 class), and nothing in the tab bar or a lint
rule currently catches it. A future defense-in-depth measure could:

- add a guard/lint that flags any `(tabs)/{route}/` folder whose stack anchor (position 0)
  is a dynamic segment (`[param].tsx`) rather than a static `index.tsx`, OR
- centralize hidden-route registration so the anchor shape is enforced by construction.

## Status

Deferred — not scheduled. No user-facing bug; purely a guardrail against future
regressions of the NAV-004/005/006 bug class. Promote to a real plan only if the bug
class recurs on a newly added route.
