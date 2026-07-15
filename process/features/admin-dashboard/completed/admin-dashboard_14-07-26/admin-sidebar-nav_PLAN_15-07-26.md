# Admin Dashboard Sidebar Navigation — Implementation Plan

**Date:** 15-07-26
**Complexity:** SIMPLE
**Feature:** admin-dashboard (cross-cutting — serves Phases 0-7)

---

## Goal

Replace the current no-navigation dashboard shell (`DashboardLayout` renders bare `<Outlet />`) with a **collapsible sidebar-only navigation system** using shadcn/ui's built-in sidebar component, themed to match the "Tactile Comic Brutalism" design language, and wired to TanStack Router with config-driven route definitions.

### Acceptance Criteria (SPEC)

1. **Renders on all routes:** Sidebar renders on all `(dashboard)` routes with correct active state highlighting.
2. **Config-driven:** Navigation items are config-driven — adding a new route equals adding one object to a config file.
3. **Theming:** Sidebar follows the brutalist theme: 2px ink borders, hard offset shadows on active items, jyellow active highlight, Fredoka group labels.
4. **Footer:** User info (email, role badge) and sign-out live in the sidebar footer.
5. **Responsiveness:** Collapsible to icon-only mode on desktop; sheet overlay on mobile/tablet.
6. **Accessibility:** Keyboard navigable, semantic HTML, visible focus indicators.
7. **Integration:** Existing pages (Dashboard home, Branches) render correctly inside the new layout.
8. **Auth intact:** No regressions in auth guard behavior.

---

## Cross-Cutting Compliance

1. **Modularity:** The navigation config is separated from the UI components. Routes are driven by a single config file.
2. **Clarity:** Reuses shadcn/ui primitives. Adheres to repo-wide naming and structure conventions (e.g. kebab-case files, PascalCase components).
3. **Safety:** Navigation changes do not destructively alter any server state or business logic. Unbuilt routes are safely marked as disabled.
4. **Security:** Sidebar utilizes `useAdminAuth()` and does not circumvent existing `beforeLoad` auth guards.
5. **UI component modularity & reusability:** Uses the official shadcn/ui sidebar component rather than a bespoke implementation. Reuses existing visual primitives (jyellow, ink borders, etc.).

---

## Touchpoints

- `apps/admin/src/routes/(dashboard)/route.tsx`
- `apps/admin/src/routes/(dashboard)/index.tsx`
- `apps/admin/src/components/ui/` (adds `sidebar.tsx`, `separator.tsx`)
- `apps/admin/src/components/` (adds `app-sidebar.tsx`, `nav-user.tsx`)
- `apps/admin/src/config/` (adds `nav-config.ts`)

## Public Contracts

- **Navigation Config:** `navConfig` array export from `apps/admin/src/config/nav-config.ts`.
- **SidebarProvider:** Provides the context for sidebar state and collapse toggling.

## Blast Radius

- **Files Created:**
  - `apps/admin/src/config/nav-config.ts`
  - `apps/admin/src/components/app-sidebar.tsx`
  - `apps/admin/src/components/nav-user.tsx`
  - `apps/admin/src/components/ui/sidebar.tsx`
  - `apps/admin/src/components/ui/separator.tsx`
- **Files Modified:**
  - `apps/admin/src/routes/(dashboard)/route.tsx` (wraps outlet with sidebar)
  - `apps/admin/src/routes/(dashboard)/index.tsx` (removes old shell layout elements)
- **Risk:** Low — additive layout change with UI restructures. Auth guards are preserved. No API/backend changes.

---

## Architecture & Design Details

### Nav Config Schema

```typescript
// src/config/nav-config.ts
interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
  activeOptions?: { exact?: boolean }
  disabled?: boolean  // grayed out + unclickable (for unbuilt routes)
}

interface NavGroup {
  label: string
  items: NavItem[]
}
```

### Brutalist Theming Spec

| Element | Classes |
|---|---|
| **Sidebar container** | `border-r-2 border-foreground bg-background` |
| **Group label** | `font-display text-caption font-semibold uppercase tracking-wider text-muted-foreground` |
| **Nav item (inactive)** | `rounded-md text-foreground transition-all` |
| **Nav item (hover)** | `bg-cream-tint-1 border-2 border-foreground` |
| **Nav item (active)** | `bg-primary border-2 border-foreground shadow-[3px_3px_0_var(--color-ink)]` |
| **Nav item (pressed)** | `shadow-[1px_1px_0_var(--color-ink)] translate-x-px translate-y-px` |
| **Nav item (disabled)** | `opacity-40 pointer-events-none cursor-not-allowed` |
| **User footer** | `border-t-2 border-foreground` |
| **Role badge** | `rounded-full px-2 py-0.5 text-xs font-semibold border-2 border-foreground` |

---

## Implementation Checklist

1. Install shadcn sidebar component: `cd apps/admin && npx shadcn@latest add sidebar separator`
2. Create nav config (`apps/admin/src/config/nav-config.ts`) using the provided schema and routing groups (Main, Catalog, Management, Dev).
3. Create AppSidebar component (`apps/admin/src/components/app-sidebar.tsx`) that reads from `navConfig` and applies the Brutalist theming spec.
4. Create NavUser component (`apps/admin/src/components/nav-user.tsx`) to display user initial, email, role badge, and sign-out button.
5. Update DashboardLayout (`apps/admin/src/routes/(dashboard)/route.tsx`) to wrap `<Outlet />` with `SidebarProvider` and `AppSidebar`.
6. Update Dashboard Home page (`apps/admin/src/routes/(dashboard)/index.tsx`) to remove the previous centered-card layout.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Sidebar renders on `/` | Agent-Probe | 1 |
| Sidebar renders on `/branches` | Agent-Probe | 1, 7 |
| Config-driven changes render | Agent-Probe | 2 |
| Active state correct | Agent-Probe | 1, 3 |
| Collapse toggle works | Agent-Probe | 5 |
| Sign-out works | Agent-Probe | 4 |
| Auth guard intact | Fully-Automated | 8 |
| Keyboard navigation (tab) | Agent-Probe | 6 |
| Mobile/tablet responsive | Agent-Probe | 5 |
| No TS errors (`pnpm --filter @jojopotato/admin typecheck`) | Fully-Automated | 7 |
| Existing tests pass (`pnpm --filter @jojopotato/admin test`) | Fully-Automated | 8 |

---

## Test Infra Improvement Notes

(none identified yet)

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

---

## Resume and Execution Handoff

- **Selected plan file path:** `process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-sidebar-nav_PLAN_15-07-26.md`
- **Last completed phase or step:** PLAN mode complete.
- **Validate-contract status:** Complete (see contract below)
- **Supporting context files loaded:** `process/context/all-context.md`, `admin-dashboard_UMBRELLA_PLAN_14-07-26.md`, `admin-sidebar-nav-plan.md` (draft).
- **Next step for fresh agent:** Proceed to EXECUTE mode.

---

## Validate Contract

### Allowed Actions:
1. **Component Scaffolding:** Execute `npx shadcn@latest add sidebar separator` within the `apps/admin` directory to create base UI components.
2. **File Creation:** Create `apps/admin/src/config/nav-config.ts`, `apps/admin/src/components/app-sidebar.tsx`, and `apps/admin/src/components/nav-user.tsx` adhering to the specified design system and schemas.
3. **Route Adjustments:** Update `apps/admin/src/routes/(dashboard)/route.tsx` to wrap the outlet with `SidebarProvider` and `AppSidebar`.
4. **Layout Cleanup:** Modify `apps/admin/src/routes/(dashboard)/index.tsx` to remove the outdated centered-card layout.
5. **Styling:** Apply the "Tactile Comic Brutalism" visual theme (jyellow active states, ink borders, specific offset shadows) strictly using Tailwind CSS classes.

### Forbidden Actions:
1. **NO Backend Modifications:** Do not modify any tRPC routers, API endpoints, or database schemas.
2. **NO Auth Guard Regression:** Do NOT modify, remove, or bypass the `beforeLoad` auth guards in `(dashboard)/route.tsx` or any child routes.
3. **NO Bespoke Sidebar Base:** Do not build a sidebar completely from scratch; you MUST build upon the installed shadcn/ui sidebar primitive.
4. **NO Unrelated Routing Changes:** Do not add or modify routes outside of the sidebar UI and shell layout configuration. Do not build out the missing pages (mark them as disabled in the config instead).
5. **NO State Management Overhaul:** Do not introduce new global state management libraries (e.g., Redux, Zustand) for the navigation state. Use the context provided by `SidebarProvider`.
