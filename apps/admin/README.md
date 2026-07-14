# Jojo Potato — Admin Dashboard (`@jojopotato/admin`)

Web back-office for **admin** / **super_admin** users to manage branches, products, deals, and
rewards, and to view orders and basic analytics. Distinct from the existing mobile `(staff)` shell
in `apps/mobile` (branch-scoped, read-mostly, for on-the-ground `staff` role users) — this app is a
full CRUD backoffice, reachable only from a browser.

**Current status: Phase 0 — Scaffold, ✅ VERIFIED.** This app boots, renders the ported brand
theme, and proves the tooling pipeline works — it has **no auth and no business screens yet**.
Phase 1 (auth/RBAC) and beyond are tracked in
[`process/features/admin-dashboard/`](../../process/features/admin-dashboard/).

## Stack

- [TanStack Start](https://tanstack.com/start) — file-based routing, Vite-based dev/build
- [Tailwind CSS v4](https://tailwindcss.com) (`@theme` token block, no `tailwind.config.*`/PostCSS)
- [shadcn/ui](https://ui.shadcn.com) — component primitives, installed as source under
  `src/components/ui/` (not a runtime dependency)
- [`@tanstack/react-query`](https://tanstack.com/query) v5 — own `QueryClient` instance, separate
  from `apps/mobile`'s
- TypeScript, Vitest + `@testing-library/react` (jsdom)

The backend is the existing `packages/api` Express service — this app is an HTTP client of it, the
same way `apps/mobile` is. No separate database or auth provider.

## Install

From the repo root (this app is a pnpm workspace member, auto-discovered via `apps/*`):

```bash
pnpm install
```

Requires Node >=20 and pnpm 10.33.0 (see root `package.json`/`.nvmrc`).

## Commands

Run from the repo root with `--filter`, or `cd apps/admin` and drop the filter:

| Command | Purpose |
|---|---|
| `pnpm --filter @jojopotato/admin dev` | Start the dev server at http://localhost:3100 |
| `pnpm --filter @jojopotato/admin build` | Production build (outputs to `dist/client` + `dist/server`) |
| `pnpm --filter @jojopotato/admin preview` | Preview the production build locally |
| `pnpm --filter @jojopotato/admin typecheck` | `tsc --noEmit` |
| `pnpm --filter @jojopotato/admin lint` | ESLint (flat config) |
| `pnpm --filter @jojopotato/admin test` | Vitest (jsdom + `@testing-library/react`) |
| `pnpm --filter @jojopotato/admin generate-routes` | Regenerate `src/routeTree.gen.ts` after adding/renaming route files |
| `pnpm --filter @jojopotato/admin clean` | Remove `dist`, `.tanstack`, `node_modules` |

These are also wired into the root turbo pipelines (`pnpm build` / `pnpm lint` / `pnpm typecheck` /
`pnpm test` from the repo root) — no separate CI configuration was needed.

## Dev server

```bash
pnpm --filter @jojopotato/admin dev
```

Then open **http://localhost:3100**.

## Testing

```bash
pnpm --filter @jojopotato/admin test
```

Currently one passing test (`src/routes/index.test.tsx`) that renders the placeholder route and
asserts the brand wordmark is present — this proves the runner precedent works end-to-end, not
full coverage. This is the **first web-app component-test runner** in the repo (see
`process/context/tests/all-tests.md`); extend it as real screens are built in Phase 1+.

Visual/on-brand acceptance checks (does it actually *look* right — colors, fonts, shadows, radii)
are **manual** — there is no automated visual-regression runner in this repo (project-wide gap,
not specific to this app). Load the dev server in a browser and eyeball it.

## Project structure

```
apps/admin/
  src/
    routes/            # TanStack Start file-based routes
      __root.tsx        # root shell — mounts QueryClientProvider
      index.tsx          # placeholder home route
      index.test.tsx      # the one Vitest test
    components/
      ui/                # shadcn/ui primitives (button.tsx, card.tsx, ...) — canonical source,
                          #   installed via the shadcn CLI, not npm-versioned
      admin-home.tsx      # placeholder page content
    lib/
      query-client.ts    # react-query client instance (own, not shared with apps/mobile)
      utils.ts            # shadcn's cn() helper
    styles/
      globals.css         # Tailwind v4 @theme brand tokens + shadcn semantic mapping
    router.tsx            # TanStack Start router-instance factory
  vite.config.ts           # tailwindcss() + tanstackStart() + viteReact() plugins
  vitest.config.ts         # separate from vite.config.ts (avoids loading the SSR plugin in tests)
  components.json          # shadcn CLI config
```

Routing is file-based: add a file under `src/routes/` and re-run `generate-routes` (or restart the
dev server) to regenerate `src/routeTree.gen.ts`.

## Theming

Brand tokens are **ported from `packages/ui/src/theme.ts`** into `src/styles/globals.css` as a
Tailwind v4 `@theme` block — the same palette, spacing, radii, shadows, and type scale the mobile
app uses. `packages/ui` itself (React Native) is **not** imported here; it can't render in a web
app.

The theme is mapped in two layers:

1. A `:root` block with raw brand values (`--background`, `--primary`, `--radius`, etc.)
2. A `@theme inline` block that remaps those into Tailwind's semantic slots so utility classes
   (`bg-background`, `text-primary`, etc.) resolve correctly

This means shadcn primitives are **on-brand by default** — a stock, unmodified `Button` or `Card`
already renders in the Jojo Potato palette. **Do not inline-override colors on a component** to "fix"
its look — if something looks off-brand, the mapping in `globals.css` is wrong and should be fixed
there, not per-screen. Light mode only for now (no dark-mode requirement in this program).
