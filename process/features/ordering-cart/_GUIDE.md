# ordering-cart

<!-- Part of Jojo Potato -->

## Scope

Menu browsing, cart management, and checkout flow for the Jojo Potato mobile app. Covers menu
item display, cart state (add/remove/update quantity), price calculation, and the checkout
sequence leading up to order placement. Payments processor is not yet decided (see
`process/context/all-context.md`).

**Status as of setup: not started.** No source files exist yet for this feature — `packages/types`
has placeholder types reserved for menu/cart/order domains, but no implementation.

## Key Source Files

None yet. Expected future locations based on current repo conventions:
- `apps/mobile/src/app/` -- Expo Router routes for menu/cart/checkout screens
- `packages/types/src/` -- shared menu, cart, and order domain types (placeholders exist)
- `packages/ui/src/` -- shared UI components (cart item, price display, etc.)

## Related Context

- `process/context/all-context.md` -- overall repo structure and tech stack

## Current Status

Status: not-started

## Folder Contents

```
process/features/ordering-cart/
  active/       -- in-progress plans for this feature (each task lives inside a {slug}_{date}/ task folder)
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
```

All artifacts (plans, specs, reports, references) colocate inside each `{slug}_{date}/` task folder. Do NOT create `reports/` or `references/` sibling dirs.
