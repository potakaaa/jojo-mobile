---
name: context:all-planning
description: "SIMPLE vs COMPLEX plan calibration and example PRD references"
keywords: plan, planning, prd, spec, simple, complex, calibration
related: []
date: 08-07-26
---

# Planning Context

This file is the canonical planning context entrypoint for Jojo Potato.

Use it after `process/context/all-context.md` when the task needs plan-shape calibration,
planning conventions, or implementation-plan examples.

## Scope

This group covers:

- example plan shapes
- SIMPLE vs COMPLEX plan calibration
- durable planning references that should not stay at the `process/context/` root

It does not cover:

- active implementation plans
- feature reports
- backlog items

Those belong under `process/general-plans/` or `process/features/`.

## Read When

Read this entrypoint when:

- creating a new plan with `generate-plan`
- checking whether work should be `SIMPLE` or `COMPLEX`
- comparing an active plan against the repo's example plan shapes

## Quick Routing

- use `.claude/skills/vc-generate-plan/references/example-simple-prd.md` to calibrate a one-session plan
- use `.claude/skills/vc-generate-plan/references/example-complex-prd.md` to calibrate a complex or multi-phase plan

## Source Paths

- `.claude/skills/vc-generate-plan/references/example-simple-prd.md`
- `.claude/skills/vc-generate-plan/references/example-complex-prd.md`

## Project-Specific Calibration Notes

Jojo Potato is currently a repo skeleton with no product features built yet. Expect most early
plans to be **SIMPLE** (single feature slice, e.g. "menu list screen" or "wire up Supabase auth")
rather than COMPLEX multi-phase programs, until a backend/auth/payments provider is chosen and
several features are being built concurrently. Re-evaluate this note once real feature work
starts landing in `process/features/{ordering-cart,pickup-branches,auth-accounts,rewards-notifications}/active/`.
