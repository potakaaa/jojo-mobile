# Branches Epic — Handoff / Resume (10-07-26)

Branch: `dev/brn`. Everything below is **code-complete, committed, and static-green**
(typecheck / lint / api-tests / `expo config` all pass). The only thing NOT done is
**on-device verification** — blocked on a Google Maps key + a dev-client rebuild (see §Next Steps).

## TL;DR — what to do next
1. Put the Google Maps key in `apps/mobile/.env.local` and **remove it from `packages/api/.env`** (wrong place).
2. **Rebuild the dev client** (expo-maps is native) → reinstall on phone.
3. Start backend + Metro, open in the **dev app** (not Expo Go), verify the Branches screens.
4. Run **UPDATE PROCESS** (it was NOT run yet — see §Unfinished process step).

---

## What shipped this session

| Issue | What | Status |
|---|---|---|
| **BRN-001** Branch locator list | search + distance/priority sort, disabled CTA, `GET /api/branches`, `priority` column (migration 0002), BranchListItem, useUserLocation, useSelectedBranch, apiFetch, distanceKm/getIsOpenNow | committed, static-green, device-pending |
| **BRN-002** Branch details | `GET /api/branches/:id` (branch + explicit+global deals, server discountLabel), formatOpeningHours, buildDirectionsUrl, DealCard validUntil, rebuilt `[branchId].tsx` | committed, static-green, device-pending |
| **BRN-004** Directions | **satisfied by BRN-002** (`buildDirectionsUrl` + Linking) — close the issue as done-by-002 | done |
| **BRN-003** Map toggle | expo-maps@57.0.0, `app.json`→`app.config.ts`, `BranchMap` + `.web.ts` stub, list/map toggle | committed, static-green, device-pending |
| Styling | Branch cards restyled yellow + black (Fredoka name), matching Home PromoBanner | committed |
| Bug fix | `useUserLocation` guarded so location-off doesn't crash the screen | committed |

## Commits on `dev/brn` (this session)
- `8fe3d67` feat(branches): add branch locator list (BRN-001)
- `d16adf6` feat(branches): add branch details screen (BRN-002)
- `3fda3dc` fix(branches): guard location errors in useUserLocation
- `395f034` refactor(branches): use shared UI components on branch screens
- `05c0c71` style(branches): yellow branch cards + display font matching promo banner
- `58fc3a7` feat(branches): add map view toggle (BRN-003)

Not committed on purpose: `eas.json` (untracked), `apps/mobile/app.json.bak` (on disk, gitignored by `*.bak`).

---

## Next Steps (on-device)

### 1. Google Maps key
- Add to `apps/mobile/.env.local`: `GOOGLE_MAPS_API_KEY=<your key>`
- **Remove** it from `packages/api/.env` (it was mistakenly placed there; the API server never uses it).
- `app.config.ts` reads it from env at build time (never committed). Restrict the key in Google Cloud to package `ph.jojopotato.mobile` + your signing SHA-1.

### 2. Rebuild the dev client (REQUIRED — native modules added)
`expo-maps` + `expo-location` are native; a JS reload can't add them. The current binary throws
`Cannot find native module 'ExpoMaps'`, which cascades to "missing default export" and breaks the whole Branches tab.
```bash
cd apps/mobile && npx expo run:android          # local (needs Android SDK + JDK 17)
# or cloud (no local toolchain):
cd apps/mobile && npx eas-cli@latest build --platform android --profile development
```
Install the new build on the phone.

### 3. Run it
```bash
docker compose up -d                              # Postgres (data already migrated + seeded)
pnpm --filter @jojopotato/api dev                 # API on :3000
pnpm --filter @jojopotato/mobile dev:bypass       # Metro + auto LAN API URL (or dev:tunnel)
```
- Open in the **"Jojo Potato" dev app**, NOT Expo Go (Expo Go can't run this project).
- **Dev auto-login** (skip the email screen): set `DEV_AUTO_LOGIN=true` + `DEV_LOGIN_EMAIL=dev@jojopotato.local` in `packages/api/.env`, restart the API. Startup logs `⚠ DEV AUTO-LOGIN ENABLED`.
- Networking gotcha hit this session: laptop `ufw` is **active**. Allow the LAN in:
  ```bash
  sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
  sudo ufw allow from 192.168.1.0/24 to any port 8081:8101 proto tcp   # (this one didn't apply yet — re-run)
  ```
  If the phone still can't reach the laptop on the same subnet, it's router AP/client isolation → use `dev:tunnel` + `ngrok http 3000`.

### 4. Verify ACs on device
- BRN-001: list renders both active branches; **IT Park "Order" CTA disabled** (pickup off); search filters by name; distance shown when location on, priority sort when off.
- BRN-002: details render all fields; deals list (it-park 5 / poblacion 4); "Get Directions" opens maps; CTA disabled when closed/pickup-off.
- BRN-003: list/map toggle; pin per branch; tap pin → details. NOTE: closed-pin muting is **iOS-only** (see gaps).

### 5. Cleanup after build confirms
- Delete `apps/mobile/app.json.bak` once the new `app.config.ts` build works.

---

## Known gaps / follow-ups (were going into backlog stubs)
1. **Android closed-pin muting** — expo-maps Google (Android) markers have no tint/opacity prop, so closed/pickup-off pins aren't visually muted on Android (iOS works via `tintColor`). Needs a custom marker image or alternative.
2. **`.env.example` doc line** — couldn't be written (privacy hook blocks `.env.example`). Add manually: `GOOGLE_MAPS_API_KEY=` to `apps/mobile/.env.example`.
3. **Test gaps** — `packages/utils` has no runner: `distanceKm`, `getIsOpenNow`, `formatOpeningHours`, `buildDirectionsUrl` are unit-untested; api HTTP-layer (supertest) test for branch routes deferred. (Same project-wide test-runner gap as the existing backlog notes.)
4. **GitHub issues** — close #11 (BRN-001), #12 (BRN-002), #14 (BRN-004, satisfied-by-002); #13 (BRN-003) close after device check. `gh` isn't authed on this machine.

---

## Unfinished process step
**UPDATE PROCESS was NOT run** (interrupted). Still pending:
- Archive the 3 task folders `process/features/pickup-branches/active/{brn-001-branch-locator,brn-002-branch-details,brn-003-map-view}_10-07-26/` → `completed/`.
- Update `process/context/all-context.md` §Current Implementation State: Branches tab is now real (locator + details + map toggle), not `<ComingSoon>`; note new API routes, `priority` column, expo-location/expo-maps deps, `app.json`→`app.config.ts`.
- Write the backlog stubs in §Known gaps above under `process/features/pickup-branches/backlog/`.
- Run audits: `vc-audit-context`, `vc-audit-plans`.

To resume: re-enter UPDATE PROCESS with the above list. The full agent prompt is reconstructable from this file.

---

## Preferences captured
- **No `Co-Authored-By` trailer** on commits (saved to memory).
- Commit directly on `dev/brn` (the working branch), not `main`.
