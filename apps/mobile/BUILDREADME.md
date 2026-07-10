# Mobile Build Commands

How to build the Jojo Potato app (iOS + Android) via EAS, locally or in the cloud.

## Prerequisites

- `eas.json` (this folder) already defines three build profiles: `development`, `preview`, `production`.
- No `eas-cli` dependency is pinned in `package.json` — commands use `npx eas-cli@latest`, which
  fetches the CLI on demand.
- You'll need to be logged in to an EAS account with access to this project
  (`npx eas-cli@latest login`), and the project is already linked via `extra.eas.projectId` in
  `app.json`.

## Local builds (`:local` scripts)

Run from the repo root. Output lands in `apps/mobile/builds/<profile>/` (gitignored — binaries
are never committed).

```
pnpm mobile:ios:build:development:local
pnpm mobile:ios:build:preview:local
pnpm mobile:ios:build:production:local

pnpm mobile:android:build:development:local
pnpm mobile:android:build:preview:local
pnpm mobile:android:build:production:local
```

Output files:

```
apps/mobile/builds/
  development/jojo-potato-development.{ipa,apk}
  preview/jojo-potato-preview.{ipa,apk}
  production/jojo-potato-production.{ipa,apk}
```

All Android profiles are configured with `buildType: "apk"` (see `eas.json`), so every local
Android build produces a directly-installable `.apk`, including `production`.

### Platform restriction (important)

`eas build --local` is a **macOS/Linux-only** feature of `eas-cli`. It does not run on native
Windows for either platform:

- iOS local builds require Xcode (macOS only).
- Android local builds require a Linux/macOS build toolchain, even though the resulting app runs
  on Android.

**On Windows, use WSL2** to run the `:local` commands above, or use the cloud build commands below
instead.

## Cloud builds (any OS, including plain Windows)

Not wired up as `pnpm` scripts — run directly with the EAS CLI from `apps/mobile/`:

```
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform android

npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile preview --platform ios
npx eas-cli@latest build --profile production --platform ios
```

Cloud builds run on Expo's servers and return a download link / QR code instead of writing to
`apps/mobile/builds/`.

## Where things are defined

| What | Where |
| --- | --- |
| Build profiles (`development`/`preview`/`production`) | `apps/mobile/eas.json` |
| `:local` script implementations | `apps/mobile/package.json` |
| Root-level passthrough scripts (`mobile:ios:build:...`) | root `package.json` |
| Output directory gitignore | `apps/mobile/.gitignore` (`builds/`) |
