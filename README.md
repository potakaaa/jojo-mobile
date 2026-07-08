# Jojo Potato — Mobile Monorepo

Foundation repo for the Jojo Potato food ordering & pickup app. This is a
**repo skeleton**, not the full product: it wires up the monorepo, tooling,
navigation shell, and shared package boundaries so ordering, cart, checkout,
pickup branches, rewards, menu, auth, and notifications can be built on top
of it without re-plumbing the project.

The app is **iOS-first**, but Android is a first-class target from day one —
see [iOS-first, Android-ready](#ios-first-android-ready) below.

## Tech stack

- [Expo](https://expo.dev) (React Native) + [Expo Router](https://docs.expo.dev/router/introduction/) — file-based navigation
- TypeScript everywhere
- [Turborepo](https://turborepo.com) — task orchestration & caching
- [pnpm](https://pnpm.io) workspaces — package manager
- Flat-config ESLint (`eslint-config-expo`) + Prettier, shared across packages

## Folder structure

```
.
├── apps/
│   └── mobile/                 # Expo Router app (iOS + Android + web)
│       ├── src/
│       │   ├── app/            # Expo Router routes (file-based)
│       │   ├── components/
│       │   ├── config/         # env.ts — typed access to EXPO_PUBLIC_* vars
│       │   ├── constants/       # app-level theme (fonts, layout) — re-exports brand tokens from @jojopotato/ui
│       │   └── hooks/
│       ├── assets/              # icons, splash, favicon (placeholder branding)
│       ├── app.json             # Expo app config
│       ├── .env.example
│       └── package.json
├── packages/
│   ├── config/                  # shared ESLint, Prettier, TypeScript configs
│   ├── types/                   # shared TS types — placeholders for menu, cart,
│   │                             # order, auth, rewards, pickup, notifications
│   ├── utils/                   # shared helpers (currency formatting, etc.)
│   └── ui/                      # shared UI components + brand tokens/theme
├── package.json                 # root scripts (turbo pipelines)
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example                 # repo-wide / CI values (EAS, etc.)
```

Packages are consumed as TypeScript source directly (no build step) via
pnpm workspace links — Metro/Expo resolves them like any other dependency.

## Install & run

Requires Node 22+ (see `.nvmrc`) and pnpm 9+.

```bash
corepack enable          # if pnpm isn't installed yet
pnpm install

# from the repo root:
pnpm ios                 # open the iOS simulator
pnpm android             # open an Android emulator
pnpm web                 # run in the browser
pnpm dev                 # plain `expo start` (pick a target from the Expo CLI menu)
```

Other useful root scripts:

```bash
pnpm lint                # eslint across every package (via turbo)
pnpm typecheck           # tsc --noEmit across every package
pnpm format              # prettier --write
pnpm format:check
pnpm build               # turbo build (currently a no-op placeholder per package)
```

All of the above are turbo pipelines (`turbo.json`), so re-runs are cached
and, once there's more than one app, only the affected packages rebuild.

## Environment variables

- `apps/mobile/.env.example` — client-bundle config. Only variables prefixed
  `EXPO_PUBLIC_` are inlined into the app; **never put secrets there**. Copy
  it to `.env` (or `.env.development` / `.env.production`) and adjust values.
  Read via `apps/mobile/src/config/env.ts`.
- `.env.example` (repo root) — placeholders for repo-wide / CI concerns
  (e.g. EAS project id) that aren't part of the client bundle.

## Branding placeholders

`packages/ui/src/theme.ts` holds the placeholder Jojo Potato brand palette
(`Brand`, `Colors`, `Spacing`) and a `<BrandWordmark />` component. App icons
and splash assets in `apps/mobile/assets/images` are simple generated "JP"
monogram placeholders — swap them (and the theme tokens) for real brand
assets when the design system is ready. `app.json` uses a placeholder
bundle identifier / package name (`ph.jojopotato.mobile`) — update this to
the real reverse-DNS id before any store submission.

## iOS-first, Android-ready

- Develop and test primarily on the iOS simulator, but run `pnpm android`
  regularly — don't let Android drift. `app.json` already declares both
  `ios` and `android` blocks (bundle identifier / package, adaptive icon).
- The app is a **managed Expo workflow** app: there are no checked-in
  `ios/`/`android/` native folders. Run `npx expo prebuild` only if/when you
  need to drop into native code; otherwise `expo start` + Expo Go /
  dev-client covers both platforms identically.
- Expo Router's file-based routes and the shared `@jojopotato/ui` theme
  tokens are platform-agnostic by construction — avoid platform-specific
  branches in new screens unless a genuine iOS/Android UX difference
  requires it (use `Platform.select` locally when it does).
- `expo-splash-screen` and adaptive icon config are already wired for both
  platforms — new brand assets just need to replace the files in
  `apps/mobile/assets/images`.

## Adding a new package

```bash
mkdir -p packages/<name>/src
# add package.json (name: "@jojopotato/<name>"), tsconfig.json extending
# @jojopotato/config/typescript/base, and an eslint.config.js re-exporting
# @jojopotato/config/eslint-base (or /eslint for RN/JSX packages)
pnpm install
```

Then add it as a workspace dependency wherever it's needed:
`"@jojopotato/<name>": "workspace:*"`.

## What's intentionally not here yet

No cart, ordering, checkout, payments, rewards, or backend integration —
this repo is the foundation those modules will be built on top of, using
`packages/types` for shared domain types and `packages/ui` for shared
components as they're introduced.
