/**
 * Shared react-query polling options for the staff order screens
 * (Active Orders, Order Detail, Completed Orders).
 *
 * Node-env-vitest safe by construction: this module imports NOTHING from
 * `@jojopotato/ui` / `react-native` / `staff-api` (per the STAFF-005 import-chain
 * constraint documented in all-context.md), so a node-env vitest `.test.ts` can
 * statically import it without vitest failing to bundle the RN dependency graph.
 */

/** Poll interval for the staff order screens (OC-4): 10s. */
export const STAFF_ORDERS_POLL_INTERVAL = 10_000;

/**
 * Shared polling options spread into every staff-order `useQuery`: re-fetch every
 * 10s while the screen is mounted, paused while the app is backgrounded
 * (`refetchIntervalInBackground: false`) to spare battery/network. Sharing one
 * constant across Active Orders, Order Detail, and Completed Orders means their
 * poll cadence + background-pause behavior can never silently drift apart.
 */
export const STAFF_POLL_OPTIONS = {
  refetchInterval: STAFF_ORDERS_POLL_INTERVAL,
  refetchIntervalInBackground: false,
} as const;
