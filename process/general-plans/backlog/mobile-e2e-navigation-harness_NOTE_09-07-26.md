---
name: plan:mobile-e2e-navigation-harness
description: "Set up an automated E2E/regression harness for mobile navigation flows once the app has enough real screens to justify it"
date: 09-07-26
feature: general
---

# Backlog: Mobile E2E Navigation Harness

## What

Set up an automated E2E/regression harness (Detox, Maestro, or Playwright for Expo web) that can
drive and assert on the app's navigation flows — auth gating, tab switching, nested-stack
back-navigation, cross-tab links, logout — instead of relying on manual/code-trace verification.

## Why

No test runner is configured anywhere in this repo (confirmed via `process/context/tests/all-tests.md`
§Known Gaps — no Jest/Vitest/Detox/Playwright in any `package.json`). The
`finalize-navigation-shell` plan (`process/general-plans/completed/finalize-navigation-shell_09-07-26/`)
built the full 5-tab shell + `(auth)` stack + auth-state seam and verified all 6 manual navigation
flows by static code-trace only (no simulator/browser available in this environment), which is not a
substitute for running the app. This is a pre-existing, project-wide gap — not introduced by that
plan — but it means any future navigation regression will only be caught by re-running those manual
flows by hand.

## When to pick this up

Once the app has enough real feature screens (Menu/Cart/Checkout/Branches business UI, not
placeholders) to justify the investment. Revisit at each subsequent navigation-touching feature —
if the manual-flow list keeps growing, that's the signal to stop deferring.

## Scope sketch (not a committed plan yet)

- Choose a runner: Detox/Maestro for native, or Playwright for the Expo web target (or both).
- Cover at minimum the 6 flows verified by code-trace in `finalize-navigation-shell`: cold-launch
  auth gating, tab-switch state preservation, nested-stack back-nav, Branches tab wiring, cross-tab
  Order History link, logout gate-flip.
- Wire into `pnpm` scripts and (once CI exists — also currently a known gap) a workflow step.

## Status

Deferred — not yet actionable as a plan. Confirmed still accurate as of 09-07-26 UPDATE PROCESS pass
(originally identified during `finalize-navigation-shell` VALIDATE as backlog artifact
`e2e-harness`; re-confirmed at EXECUTE/EVL closeout — no runner was introduced by that plan, gap is
unchanged).
