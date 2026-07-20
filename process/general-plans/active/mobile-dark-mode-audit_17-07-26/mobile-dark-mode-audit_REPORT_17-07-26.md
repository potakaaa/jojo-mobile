---
phase: mobile-dark-mode-audit-sections-A-B
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: general-plans
plan: process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md
---

# Mobile Dark-Mode Audit — Sections A + B EXECUTE Report

**Scope of this spawn:** Sections A (signature tightening) and B (tsc sweep + enumeration) ONLY.
Sections C (fix call sites), D (StatusBar), E (tests), F (`all-tests.md`) were explicitly EXCLUDED by
the orchestrator so that Execute-Agent Instruction **E2** can re-score the Section C strategy against
the REAL defect count produced here, rather than a guess.

**TL;DR:** 27 components tightened (not 26 — plan undercounted by 1). The sweep produced **98 defects
across 36 files** (49 tsc in `packages/ui` + 49 tsc in `apps/mobile`), plus **22 failing jest suites /
57 failing tests** in `packages/ui`. Both known-bad sites appear at their exact predicted lines. The
tree is intentionally red — that red IS the audit deliverable.

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | general-plans |
| 2 | phase | EXECUTE (Sections A+B only) |
| 3 | session-goal | Fix the mobile dark-mode rendering bug class (silent mode-default on shared UI components) + StatusBar legibility |
| 4 | branch | `spec/mobile-dark-mode-audit` |
| 5 | worktree | main (no separate worktree) |
| 6 | context-group | `tests` |
| 7 | blast-radius-packages | `packages/ui`, `apps/mobile` |
| 8 | active-plan | `process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md` |
| 9 | test-runner | `tsc --noEmit` \| jest (packages/ui) \| vitest + jest (apps/mobile) |
| 10 | validate-contract | inline in plan, `Gate: PASS`, `generated-by: outer-pvl`, `date: 2026-07-17` |

## What Was Done

### Section A — Signature Tightening (COMPLETE)

Checklist item 1 (confirm actual signatures before editing) was performed first, as required. Result:
the codebase is **perfectly uniform** — every one of the 27 component files carries exactly one
`mode?: ThemeMode` declaration and exactly one `mode = 'light'` destructuring default. No file
deviated. No file lacked a `mode` prop. Zero skips.

Two mechanical substitutions per file:
- `mode?: ThemeMode` → `mode: ThemeMode` (interface — drop optionality)
- `mode = 'light'` → `mode` (destructuring — drop default; covers both the `mode = 'light',`
  multi-line form and the `mode = 'light' }` inline-terminal form)

Diff: **27 files changed, 54 insertions(+), 54 deletions(-)** — exactly 2 lines per file, zero
collateral edits. Full diff reviewed line-by-line before proceeding; no behavior, token, prop, or
export changes leaked in (Section A step 4 honored).

**Components tightened (27):** addon-selector, badge, branch-card, branch-list-item, brand-wordmark,
button, card, cart-item, cart-summary, confirm-dialog, coupon-card, deal-card, empty-state,
flavor-selector, google-button, input, notification-row, order-status-badge, order-status-timeline,
payment-method-selector, pickup-time-badge, product-card, reward-progress-card, rewards-terms,
size-selector, star-progress-bar, toggle.

### Section B — tsc Sweep + Enumeration (COMPLETE)

A **baseline** run was taken first (via `git stash` of the Section A diff) to guarantee every error
counted is attributable to Section A and not pre-existing. **Baseline: both packages exit 0, zero
errors.** See Deviations for why this matters.

---

## Section B — THE ENUMERATION (verbatim, complete, untruncated)

**Totals: 98 tsc errors across 36 files.** Error codes: 97 × TS2741 (`Property 'mode' is missing`),
1 × TS2322 (spread-widening — see Finding 4).

### B.1 — `pnpm --filter @jojopotato/ui typecheck` → exit 2, 49 errors, 23 files

```
src/components/__tests__/badge.test.tsx(6,11): error TS2741: Property 'mode' is missing in type '{ label: string; }' but required in type 'BadgeProps'.
src/components/__tests__/branch-card.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ branch: PickupBranch; isOpen: true; }' but required in type 'BranchCardProps'.
src/components/__tests__/button.test.tsx(15,17): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; }' but required in type 'ButtonProps'.
src/components/__tests__/button.test.tsx(19,39): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; }' but required in type 'ButtonProps'.
src/components/__tests__/button.test.tsx(26,39): error TS2741: Property 'mode' is missing in type '{ label: string; size: "sm"; onPress: () => void; }' but required in type 'ButtonProps'.
src/components/__tests__/card.test.tsx(8,6): error TS2741: Property 'mode' is missing in type '{ children: Element; }' but required in type 'CardProps'.
src/components/__tests__/cart-item.test.tsx(9,6): error TS2741: Property 'mode' is missing in type '{ item: CartItem; product: MenuItem; flavor: Flavor; size: Size; onIncrement: () => void; onDecrement: () => void; }' but required in type 'CartItemProps'.
src/components/__tests__/cart-item.test.tsx(29,6): error TS2741: Property 'mode' is missing in type '{ item: CartItem; product: MenuItem; }' but required in type 'CartItemProps'.
src/components/__tests__/cart-item.test.tsx(40,17): error TS2741: Property 'mode' is missing in type '{ item: CartItem; product: MenuItem; onRemove: () => void; }' but required in type 'CartItemProps'.
src/components/__tests__/cart-summary.test.tsx(6,11): error TS2741: Property 'mode' is missing in type '{ subtotalCents: number; totalCents: number; }' but required in type 'CartSummaryProps'.
src/components/__tests__/cart-summary.test.tsx(11,6): error TS2741: Property 'mode' is missing in type '{ subtotalCents: number; discountCents: number; discountLabel: string; totalCents: number; }' but required in type 'CartSummaryProps'.
src/components/__tests__/confirm-dialog.test.tsx(10,6): error TS2322: Type '{ visible: boolean; title: string; message: string; confirmLabel: string; cancelLabel: string; onConfirm: (() => void) | Mock<any, any, any>; onCancel: (() => void) | Mock<any, any, any>; mode?: "light" | ... 1 more ... | undefined; variant?: ConfirmDialogVariant | undefined; }' is not assignable to type 'ConfirmDialogProps'.
  Types of property 'mode' are incompatible.
    Type '"light" | "dark" | undefined' is not assignable to type '"light" | "dark"'.
      Type 'undefined' is not assignable to type '"light" | "dark"'.
src/components/__tests__/coupon-card.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ coupon: Coupon; }' but required in type 'CouponCardProps'.
src/components/__tests__/deal-card.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ deal: Deal; }' but required in type 'DealCardProps'.
src/components/__tests__/empty-state.test.tsx(6,11): error TS2741: Property 'mode' is missing in type '{ iconName: "cart-outline"; title: string; }' but required in type 'EmptyStateProps'.
src/components/__tests__/empty-state.test.tsx(11,6): error TS2741: Property 'mode' is missing in type '{ iconName: "cart-outline"; title: string; description: string; actionLabel: string; onAction: () => void; }' but required in type 'EmptyStateProps'.
src/components/__tests__/flavor-selector.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ flavors: Flavor[]; selectedFlavorId: string; }' but required in type 'FlavorSelectorProps'.
src/components/__tests__/input.test.tsx(6,11): error TS2741: Property 'mode' is missing in type '{ label: string; placeholder: string; }' but required in type 'InputProps'.
src/components/__tests__/notification-row.test.tsx(7,6): error TS2741: Property 'mode' is missing in type '{ title: string; body: string; timeLabel: string; unread: true; iconName: "receipt-outline"; onPress: () => void; }' but required in type 'NotificationRowProps'.
src/components/__tests__/notification-row.test.tsx(22,6): error TS2741: Property 'mode' is missing in type '{ title: string; body: string; timeLabel: string; unread: false; iconName: "pricetag-outline"; onPress: () => void; }' but required in type 'NotificationRowProps'.
src/components/__tests__/notification-row.test.tsx(36,6): error TS2741: Property 'mode' is missing in type '{ title: string; body: string; timeLabel: string; unread: true; iconName: "star-outline"; onPress: Mock<any, any, any>; }' but required in type 'NotificationRowProps'.
src/components/__tests__/order-status-badge.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ status: "preparing"; }' but required in type 'OrderStatusBadgeProps'.
src/components/__tests__/order-status-badge.test.tsx(19,11): error TS2741: Property 'mode' is missing in type '{ status: OrderStatus; }' but required in type 'OrderStatusBadgeProps'.
src/components/__tests__/order-status-timeline.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ currentStatus: "preparing"; }' but required in type 'OrderStatusTimelineProps'.
src/components/__tests__/order-status-timeline.test.tsx(11,11): error TS2741: Property 'mode' is missing in type '{ currentStatus: "cancelled"; }' but required in type 'OrderStatusTimelineProps'.
src/components/__tests__/order-status-timeline.test.tsx(17,13): error TS2741: Property 'mode' is missing in type '{ currentStatus: OrderStatus; }' but required in type 'OrderStatusTimelineProps'.
src/components/__tests__/payment-method-selector.test.tsx(24,6): error TS2741: Property 'mode' is missing in type '{ value: "pay_at_branch"; onChange: () => void; onlinePaymentEnabled: false; }' but required in type 'PaymentMethodSelectorProps'.
src/components/__tests__/payment-method-selector.test.tsx(37,6): error TS2741: Property 'mode' is missing in type '{ value: "pay_at_branch"; onChange: () => void; onlinePaymentEnabled: false; }' but required in type 'PaymentMethodSelectorProps'.
src/components/__tests__/payment-method-selector.test.tsx(53,6): error TS2741: Property 'mode' is missing in type '{ value: "pay_at_branch"; onChange: () => void; onlinePaymentEnabled: true; }' but required in type 'PaymentMethodSelectorProps'.
src/components/__tests__/payment-method-selector.test.tsx(66,6): error TS2741: Property 'mode' is missing in type '{ value: "pay_at_branch"; onChange: Mock<any, any, any>; onlinePaymentEnabled: false; }' but required in type 'PaymentMethodSelectorProps'.
src/components/__tests__/payment-method-selector.test.tsx(80,6): error TS2741: Property 'mode' is missing in type '{ value: "pay_at_branch"; onChange: Mock<any, any, any>; onlinePaymentEnabled: true; }' but required in type 'PaymentMethodSelectorProps'.
src/components/__tests__/pickup-time-badge.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ pickupTime: PickupTime; }' but required in type 'PickupTimeBadgeProps'.
src/components/__tests__/product-card.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ product: MenuItem; }' but required in type 'ProductCardProps'.
src/components/__tests__/reward-progress-card.test.tsx(7,17): error TS2741: Property 'mode' is missing in type '{ rewards: RewardProgress; }' but required in type 'RewardProgressCardProps'.
src/components/__tests__/reward-progress-card.test.tsx(12,6): error TS2741: Property 'mode' is missing in type '{ rewards: { currentStars: number; requiredStars: number; }; }' but required in type 'RewardProgressCardProps'.
src/components/__tests__/rewards-terms.test.tsx(6,17): error TS2741: Property 'mode' is missing in type '{}' but required in type 'RewardsTermsProps'.
src/components/__tests__/rewards-terms.test.tsx(11,52): error TS2741: Property 'mode' is missing in type '{}' but required in type 'RewardsTermsProps'.
src/components/__tests__/rewards-terms.test.tsx(23,39): error TS2741: Property 'mode' is missing in type '{}' but required in type 'RewardsTermsProps'.
src/components/__tests__/size-selector.test.tsx(7,11): error TS2741: Property 'mode' is missing in type '{ sizes: Size[]; selectedSizeId: string; }' but required in type 'SizeSelectorProps'.
src/components/__tests__/star-progress-bar.test.tsx(14,17): error TS2741: Property 'mode' is missing in type '{ progress: StarProgress; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/star-progress-bar.test.tsx(20,6): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/star-progress-bar.test.tsx(29,6): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/star-progress-bar.test.tsx(32,30): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/star-progress-bar.test.tsx(40,6): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/star-progress-bar.test.tsx(49,6): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/star-progress-bar.test.tsx(58,6): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/components/__tests__/toggle.test.tsx(8,17): error TS2741: Property 'mode' is missing in type '{ value: true; onValueChange: () => void; label: string; }' but required in type 'ToggleProps'.
src/components/__tests__/toggle.test.tsx(9,17): error TS2741: Property 'mode' is missing in type '{ value: false; onValueChange: () => void; label: string; }' but required in type 'ToggleProps'.
src/components/__tests__/toggle.test.tsx(14,39): error TS2741: Property 'mode' is missing in type '{ value: false; onValueChange: Mock<any, any, any>; }' but required in type 'ToggleProps'.
```

**Every `packages/ui` error is in its own `__tests__/` fixtures. Zero errors in `packages/ui/src`
production component source** — i.e. no internal cross-component usage broke.

### B.2 — `pnpm --filter @jojopotato/mobile typecheck` → exit 2, 49 errors, 13 files

```
src/app/(staff)/branch-pickup-settings.tsx(94,22): error TS2741: Property 'mode' is missing in type '{ value: string; onChangeText: (text: string) => void; keyboardType: "number-pad"; returnKeyType: "done"; maxLength: number; editable: boolean; }' but required in type 'InputProps'.
src/app/(tabs)/index.tsx(256,14): error TS2741: Property 'mode' is missing in type '{ label: string; }' but required in type 'BadgeProps'.
src/app/(tabs)/index.tsx(324,18): error TS2741: Property 'mode' is missing in type '{ label: string; }' but required in type 'BadgeProps'.
src/app/(tabs)/order/cart.tsx(239,6): error TS2741: Property 'mode' is missing in type '{ children: (Element | Element[])[]; style: { marginHorizontal: 24; marginTop: 16; gap: 8; }; }' but required in type 'CardProps'.
src/app/(tabs)/order/history.tsx(74,16): error TS2741: Property 'mode' is missing in type '{ children: (Element | null)[]; }' but required in type 'CardProps'.
src/app/(tabs)/order/history.tsx(93,20): error TS2741: Property 'mode' is missing in type '{ status: OrderStatus; }' but required in type 'OrderStatusBadgeProps'.
src/app/(tabs)/order/tracking/[orderId].tsx(91,10): error TS2741: Property 'mode' is missing in type '{ currentStatus: OrderStatus; liveMode: boolean; }' but required in type 'OrderStatusTimelineProps'.
src/app/component-showcase.tsx(228,14): error TS2741: Property 'mode' is missing in type '{}' but required in type 'BrandWordmarkProps'.
src/app/component-showcase.tsx(229,14): error TS2741: Property 'mode' is missing in type '{ size: number; }' but required in type 'BrandWordmarkProps'.
src/app/component-showcase.tsx(233,14): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; }' but required in type 'ButtonProps'.
src/app/component-showcase.tsx(234,14): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "accent"; onPress: () => void; }' but required in type 'ButtonProps'.
src/app/component-showcase.tsx(235,14): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "ink"; onPress: () => void; }' but required in type 'ButtonProps'.
src/app/component-showcase.tsx(236,14): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "outline"; onPress: () => void; }' but required in type 'ButtonProps'.
src/app/component-showcase.tsx(237,14): error TS2741: Property 'mode' is missing in type '{ label: string; disabled: true; onPress: () => void; }' but required in type 'ButtonProps'.
src/app/component-showcase.tsx(241,14): error TS2741: Property 'mode' is missing in type '{ children: Element; }' but required in type 'CardProps'.
src/app/component-showcase.tsx(249,14): error TS2741: Property 'mode' is missing in type '{ label: string; }' but required in type 'BadgeProps'.
src/app/component-showcase.tsx(250,14): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "success"; }' but required in type 'BadgeProps'.
src/app/component-showcase.tsx(251,14): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "warning"; }' but required in type 'BadgeProps'.
src/app/component-showcase.tsx(252,14): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "danger"; }' but required in type 'BadgeProps'.
src/app/component-showcase.tsx(256,14): error TS2741: Property 'mode' is missing in type '{ label: string; value: string; onChangeText: Dispatch<SetStateAction<string>>; placeholder: string; }' but required in type 'InputProps'.
src/app/component-showcase.tsx(262,14): error TS2741: Property 'mode' is missing in type '{ label: string; value: string; onChangeText: () => void; placeholder: string; error: string; }' but required in type 'InputProps'.
src/app/component-showcase.tsx(272,14): error TS2741: Property 'mode' is missing in type '{ product: MenuItem; }' but required in type 'ProductCardProps'.
src/app/component-showcase.tsx(273,14): error TS2741: Property 'mode' is missing in type '{ product: MenuItem; }' but required in type 'ProductCardProps'.
src/app/component-showcase.tsx(277,14): error TS2741: Property 'mode' is missing in type '{ deal: Deal; onPress: () => void; }' but required in type 'DealCardProps'.
src/app/component-showcase.tsx(281,14): error TS2741: Property 'mode' is missing in type '{ branch: PickupBranch; isOpen: true; onPress: () => void; }' but required in type 'BranchCardProps'.
src/app/component-showcase.tsx(282,14): error TS2741: Property 'mode' is missing in type '{ branch: PickupBranch; isOpen: false; onPress: () => void; }' but required in type 'BranchCardProps'.
src/app/component-showcase.tsx(290,14): error TS2741: Property 'mode' is missing in type '{ rewards: RewardProgress; onPress: () => void; }' but required in type 'RewardProgressCardProps'.
src/app/component-showcase.tsx(294,14): error TS2741: Property 'mode' is missing in type '{ progress: StarProgress; }' but required in type 'StarProgressBarProps'.
src/app/component-showcase.tsx(295,14): error TS2741: Property 'mode' is missing in type '{ progress: { currentStars: number; requiredStars: number; }; }' but required in type 'StarProgressBarProps'.
src/app/component-showcase.tsx(300,16): error TS2741: Property 'mode' is missing in type '{ key: OrderStatus; status: OrderStatus; }' but required in type 'OrderStatusBadgeProps'.
src/app/component-showcase.tsx(305,14): error TS2741: Property 'mode' is missing in type '{ currentStatus: "preparing"; }' but required in type 'OrderStatusTimelineProps'.
src/app/component-showcase.tsx(309,14): error TS2741: Property 'mode' is missing in type '{ coupon: Coupon; onPress: () => void; }' but required in type 'CouponCardProps'.
src/app/component-showcase.tsx(310,14): error TS2741: Property 'mode' is missing in type '{ coupon: Coupon; }' but required in type 'CouponCardProps'.
src/app/component-showcase.tsx(314,14): error TS2741: Property 'mode' is missing in type '{ item: { quantity: number; lineId: string; menuItemId: string; productNameSnapshot: string; unitPriceCents: number; selectedOptions: CartItemOption[]; notes?: string | undefined; }; ... 4 more ...; onDecrement: () => void; }' but required in type 'CartItemProps'.
src/app/component-showcase.tsx(325,14): error TS2741: Property 'mode' is missing in type '{ flavors: Flavor[]; selectedFlavorId: string | undefined; onSelect: (flavor: Flavor) => void; }' but required in type 'FlavorSelectorProps'.
src/app/component-showcase.tsx(333,14): error TS2741: Property 'mode' is missing in type '{ sizes: Size[]; selectedSizeId: string | undefined; onSelect: (size: Size) => void; }' but required in type 'SizeSelectorProps'.
src/app/component-showcase.tsx(341,14): error TS2741: Property 'mode' is missing in type '{ pickupTime: PickupTime; }' but required in type 'PickupTimeBadgeProps'.
src/app/component-showcase.tsx(342,14): error TS2741: Property 'mode' is missing in type '{ pickupTime: PickupTime; }' but required in type 'PickupTimeBadgeProps'.
src/features/home/components/product-grid.tsx(27,10): error TS2741: Property 'mode' is missing in type '{ product: MenuItem; imageSource: ImageSourcePropType | undefined; onPress: (() => void) | undefined; }' but required in type 'ProductCardProps'.
src/features/home/components/promo-banner.tsx(24,10): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; variant: "accent"; style: { alignSelf: "flex-start"; marginTop: 4; }; }' but required in type 'ButtonProps'.
src/features/menu/components/add-to-cart-bar.tsx(64,12): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; style: { minWidth: number; } | { opacity: number; }; }' but required in type 'ButtonProps'.
src/features/menu/components/add-to-cart-bar.tsx(70,12): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; variant: "outline"; disabled: true; style: { minWidth: number; }; }' but required in type 'ButtonProps'.
src/features/menu/components/category-section.tsx(56,22): error TS2741: Property 'mode' is missing in type '{ product: MenuItem; imageSource: { uri: string; } | undefined; onPress: () => void; }' but required in type 'ProductCardProps'.
src/features/menu/components/option-group-selector.tsx(55,10): error TS2741: Property 'mode' is missing in type '{ label: string; variant: "default" | "warning"; }' but required in type 'BadgeProps'.
src/features/menu/components/option-group-selector.tsx(62,10): error TS2741: Property 'mode' is missing in type '{ flavors: { id: string; name: string; }[]; selectedFlavorId: string | undefined; onSelect: (flavor: Flavor) => void; }' but required in type 'FlavorSelectorProps'.
src/features/menu/components/option-group-selector.tsx(68,10): error TS2741: Property 'mode' is missing in type '{ sizes: { id: string; label: string; }[]; selectedSizeId: string | undefined; onSelect: (size: Size) => void; }' but required in type 'SizeSelectorProps'.
src/features/menu/components/option-group-selector.tsx(74,10): error TS2741: Property 'mode' is missing in type '{ options: { id: string; name: string; }[]; selectedIds: string[]; onToggle: (id: string) => void; }' but required in type 'AddOnSelectorProps'.
src/features/shared/components/screen-message.tsx(34,10): error TS2741: Property 'mode' is missing in type '{ label: string; onPress: () => void; style: { marginTop: 8; }; }' but required in type 'ButtonProps'.
src/test-utils/__tests__/runner-smoke.test.tsx(13,6): error TS2741: Property 'mode' is missing in type '{ iconName: "star-outline"; title: string; description: string; }' but required in type 'EmptyStateProps'.
```

### B.3 — Known-bad site cross-check (Checklist item 4) — **BOTH CONFIRMED PRESENT**

| Predicted site | Appears in enumeration? | Exact match |
|---|---|---|
| `apps/mobile/src/app/(tabs)/order/history.tsx:74` | **YES** | `history.tsx(74,16)` — `CardProps` |
| `apps/mobile/src/app/(tabs)/order/cart.tsx:239` | **YES** | `cart.tsx(239,6)` — `CardProps` |

Both hit at the exact predicted line numbers. The plan's central completeness claim holds: Section A
converts the silent bug into a hard compile error. No stop-and-re-verify condition triggered.

The sweep also found a **third defect in `history.tsx` the plan did not predict** — `history.tsx(93,20)`,
an `OrderStatusBadge` also missing `mode`, 19 lines below the known `Card`. This is the sweep earning
its keep: the same screen had a second, unreported instance.

### B.4 — `pnpm --filter @jojopotato/ui test` (Section B step 5) → exit 1

```
Test Suites: 22 failed, 2 passed, 24 total
Tests:       57 failed, 5 passed, 62 total
```

**Failing suites (22):** badge, branch-card, card, cart-item, cart-summary, confirm-dialog,
coupon-card, deal-card, empty-state, flavor-selector, input, notification-row, order-status-badge,
order-status-timeline, payment-method-selector, pickup-time-badge, product-card,
reward-progress-card, rewards-terms, size-selector, star-progress-bar, toggle.

**Passing suites (2):** `barrel-import.test.tsx` (no tsc error — renders nothing), `button.test.tsx`.

Root cause: `const theme = Colors[mode]` with `mode === undefined` → `theme === undefined` → the
component throws on first `theme.*` read (e.g. `at border (src/components/badge.tsx:39:76)`). These
are runtime failures of the **same 49 tsc defects**, not additional distinct sites — they resolve
together when Section C threads `mode` through.

**`button.test.tsx` is a notable outlier:** 3 tsc errors, but the suite **passes at runtime**. Button
evidently does not dereference `theme` on the tested code paths, so `undefined` slips through
silently. This is the exact bug-class the plan exists to kill, in miniature: a tsc-only defect with
no runtime signal. It is the strongest available evidence that the required-prop change is doing real
work that tests alone would not have caught.

---

## Section B — Defect Grouping by Feature Area (for Section C partitioning / E2)

**`apps/mobile` — 49 errors, 13 files:**

| Feature area | Files | Errors | Files (detail) |
|---|---|---|---|
| dev showcase | 1 | **31** | `src/app/component-showcase.tsx` (31) |
| `menu/` | 3 | 7 | `option-group-selector.tsx` (4), `add-to-cart-bar.tsx` (2), `category-section.tsx` (1) |
| `order/` | 3 | 4 | `history.tsx` (2), `cart.tsx` (1), `tracking/[orderId].tsx` (1) |
| home / `(tabs)` root | 3 | 4 | `(tabs)/index.tsx` (2), `home/components/product-grid.tsx` (1), `home/components/promo-banner.tsx` (1) |
| `staff/` | 1 | 1 | `(staff)/branch-pickup-settings.tsx` (1) |
| `shared/` | 1 | 1 | `features/shared/components/screen-message.tsx` (1) |
| test-utils | 1 | 1 | `src/test-utils/__tests__/runner-smoke.test.tsx` (1) |

**`packages/ui` — 49 errors, 23 files:** all under `src/components/__tests__/`. Largest:
`star-progress-bar.test.tsx` (7), `payment-method-selector.test.tsx` (5), then toggle / rewards-terms /
order-status-timeline / notification-row / cart-item / button (3 each).

**Feature areas with ZERO defects** (path-anchored greps, all confirmed 0): `app/(auth)/`,
`app/(onboarding)/`, `app/(tabs)/rewards/`, `app/(tabs)/account/`, `app/(tabs)/branches/`. See
Deviations Finding 2 — this contradicts the plan's Blast Radius prediction.

## What Was Skipped or Deferred

- **Sections C, D, E, F — NOT STARTED, by orchestrator instruction.** This spawn was scoped to A+B so
  that Execute-Agent Instruction E2 can re-score Section C's strategy against the real count (now
  known: 98 defects / 36 files). No fix, StatusBar, test, or doc work was attempted or pre-guessed.
- **Section A step 5 commit checkpoint — NOT performed.** The plan says "consider a standalone commit";
  CLAUDE.md's Commit Hygiene rule says commit only when the user asks. Deferred to the user/orchestrator
  rather than committing autonomously. **The Section A diff is currently uncommitted and the tree does
  not compile** — see Concerns.

## Test Gate Outcomes

| Gate | Baseline (pre-Section-A) | Post-Section-A | Interpretation |
|---|---|---|---|
| `pnpm --filter @jojopotato/ui typecheck` | **exit 0, 0 errors** | exit 2, **49 errors** | 49 defects revealed |
| `pnpm --filter @jojopotato/mobile typecheck` | **exit 0, 0 errors** | exit 2, **49 errors** | 49 defects revealed |
| `pnpm --filter @jojopotato/ui test` | not baselined | exit 1, 22/24 suites fail | runtime face of the same 49 |
| `pnpm --filter @jojopotato/mobile test` | not run | not run | Section E scope |
| `pnpm --filter @jojopotato/ui check-tokens` | not run | not run | Section E scope |

Red gates here are the **intended, correct outcome of Section B** — the enumeration is the
deliverable. They are not failures to fix within this spawn.

## Plan Deviations

None in execution — Sections A and B were performed exactly as written. The following are **findings
that contradict the plan's own stated assumptions**, surfaced as required by Section A step 1 and
Section C step 2 rather than silently absorbed:

**Finding 1 — component count is 27, not 26 (plan undercount).** The plan says "26 components" in
Goals, Scope, Touchpoints, Public Contracts, Blast Radius, and the Checklist, and its Touchpoints list
names 27 files. The real count is **27** — all 27 files in `packages/ui/src/components/` have a
`mode` prop, and all 27 were tightened. The plan's prose count was off by one; its file list was
right. Section E's guard script must track **27** component names, not 26.

**Finding 2 — Blast Radius over-predicted breadth; the real spread is narrow and concentrated.** The
plan predicted breakage "likely spans all 5 tabs, `(auth)`, `(onboarding)`, `(staff)`". Reality:
`(auth)`, `(onboarding)`, `rewards/`, `account/`, and `branches/` have **zero** defects — those
surfaces already thread `mode` correctly. Real production-screen breakage is only 17 errors across 11
files; **31 of 49 mobile errors (63%) are in one dev-only file**, `component-showcase.tsx`. This
materially changes Section C's shape: it is not a broad multi-area sweep, it is one big mechanical
file plus a thin tail. Directly relevant to E2's strategy re-score.

**Finding 3 — `card.test.tsx` already exists; the plan's premise for it is false.** The plan lists
`packages/ui/src/components/card.test.tsx` as a **new file** and asserts "`packages/ui` has zero Card
coverage today" (Touchpoints; Section E step 3). Both are wrong: `packages/ui/src/components/__tests__/card.test.tsx`
exists today, is one of the 24 suites, and currently fails (`card.test.tsx(8,6)`). Note also the path:
the repo convention is `src/components/__tests__/*.test.tsx`, **not** the colocated
`src/components/card.test.tsx` the plan specifies. Section E must extend the existing file at the
existing path, not create a new one. Flagged for Section E — not acted on here.

**Finding 4 — a spread-prop widening case exists in `packages/ui`, and it is the single non-TS2741
error.** `confirm-dialog.test.tsx:10` spreads `{...over}` typed `Partial<ComponentProps<typeof
ConfirmDialog>>`, producing the lone **TS2322** (`Type 'undefined' is not assignable to type '"light"
| "dark"'`) instead of a TS2741. VALIDATE's Gap 1 note recorded "zero spread-prop occurrences on any
of the 26 tracked components across `apps/mobile/src`" — that claim is scoped to `apps/mobile` and
remains true there (confirmed: zero spread cases in the mobile enumeration), but it does **not** hold
repo-wide. `packages/ui`'s own tests contain exactly the pattern Gap 1 was written to defend against.
Section E's guard script scope decision should account for this. Encouragingly, tsc **did** catch it —
it degraded to a different error code, not to silence.

**Finding 5 — `all-context.md`'s "3 pre-existing mobile typecheck errors" claim is stale.** It states
`apps/mobile` has 3 pre-existing typecheck errors (`@gorhom/bottom-sheet`, `expo-maps`,
`expo-location` type stubs). The measured baseline is **0 errors in both packages**. They have since
been resolved. This is load-bearing: it means all 98 errors are cleanly attributable to Section A with
no pre-existing noise to subtract. Worth correcting at UPDATE PROCESS.

**Finding 6 — `all-context.md` says `packages/ui` has "3 source files".** It has 27 components + 24
test suites. Same staleness class as Finding 5; note for UPDATE PROCESS.

## Test Infra Gaps Found

- No new gaps introduced by A+B. The `packages/ui` jest runner and both `tsc --noEmit` gates all work
  as the plan assumed and were confirmed real this pass.
- **`button.test.tsx` passing while type-broken** (see B.4) is a genuine coverage gap in
  `packages/ui`'s existing suite: Button's tested paths never dereference `theme`, so a wrong/absent
  mode is invisible to its tests. Section E's assertion-on-resolved-style approach (plan Section E
  step 4's explicit warning against prop-presence-only assertions) is the right fix, and this is
  concrete evidence for why that warning matters.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md`
- **Finished:** Section A (27/27 components tightened, verified diff). Section B (full enumeration:
  98 tsc defects / 36 files + 22 failing ui jest suites; both known-bad sites confirmed; baseline
  established clean; feature-area grouping produced for E2).
- **Verified:** baseline-vs-post-change delta measured on both packages; every error attributable to
  Section A; known-bad-site cross-check passed.
- **Still unverified:** everything in Sections C–F. The repo does **not** currently typecheck.
- **Remaining:** E2 strategy re-score → Section C fix loop → D → E → F.
- **Closeout classification:** **Keep in active** — code-incomplete by design; this spawn's scope is
  done but the plan is mid-flight and the tree is intentionally red.

## Forward Preview

**Test Infra Found:** `packages/ui`: jest via `pnpm --filter @jojopotato/ui test` (24 suites, 62 tests),
`tsc --noEmit`, `check-tokens`. `apps/mobile`: `tsc --noEmit`, vitest+jest via `pnpm --filter
@jojopotato/mobile test`. Test convention confirmed: `src/components/__tests__/*.test.tsx` in
`packages/ui`; `src/features/{domain}/__tests__/*.test.tsx` in `apps/mobile`.

**Blast Radius Changes:** Narrower than the plan predicted for production screens (11 files / 17
errors), wider than predicted inside `packages/ui`'s test suite (23 files / 49 errors — the plan
treated ui-side breakage as a possibility; it is 50% of all defects). Component count is 27, not 26.

**Commands to Stay Green:** `pnpm --filter @jojopotato/ui typecheck`, `pnpm --filter @jojopotato/mobile
typecheck`, `pnpm --filter @jojopotato/ui test`, `pnpm --filter @jojopotato/mobile test`, `pnpm
--filter @jojopotato/ui check-tokens`.

**Dependency Changes:** none. No new deps, no schema, no migration, no API surface. Risk class: none
of auth/billing/schema/public-API/secrets — high-risk evidence pack not required (confirmed).

## Follow-Up Stubs Created

None. No backlog stub was written: every defect enumerated here is in-scope for Section C of this same
plan, not deferred work. Findings 1–6 are plan-accuracy corrections routed to Sections C/E and UPDATE
PROCESS via this report.

## CONTEXT_PARTIAL Items

None — all context needed for A+B was available and loaded.
