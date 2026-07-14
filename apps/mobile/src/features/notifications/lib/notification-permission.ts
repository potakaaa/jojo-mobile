/**
 * First-order notification-permission seam — LOCAL STUB (plan A2).
 *
 * This deliberately does NOT add `expo-notifications` and does NOT register a
 * push token: it returns a mock permission result and guards a fire-once flag so
 * the prompt only "fires" on the customer's first successful order and never
 * re-prompts within a session. #75 (PUSH-004) swaps the body for the real
 * `expo-notifications` permission call — see TODO below.
 *
 * The once-flag is session-scoped (module-level in-memory): it resets on a full
 * reload. Real cross-launch persistence is #75's job (documented Known Gap).
 */

export type PermissionResult = 'granted' | 'denied' | 'undetermined';

/**
 * Pure fire-once guard (E4): given whether the prompt was already asked, decide
 * whether to prompt now. Extracted so the fire-once rule is vitest-provable
 * instead of Agent-Probe-only.
 */
export function shouldPromptPermission(alreadyAsked: boolean): boolean {
  return !alreadyAsked;
}

/** Session-scoped "already asked" flag (in-memory; resets on reload — A2). */
let alreadyAsked = false;

/**
 * `__DEV__`-only override so the Agent-Probe decline walkthrough can simulate a
 * 'denied' outcome without a real OS dialog. Defaults to 'granted'.
 */
let devMockResult: PermissionResult = 'granted';

/** Test/dev helper — reset the once-guard (used by unit tests and __DEV__ tooling). */
export function __resetPermissionSeam(mock: PermissionResult = 'granted'): void {
  alreadyAsked = false;
  devMockResult = mock;
}

/**
 * Request notification permission (STUB). Fires at most once per session; every
 * call after the first returns 'undetermined' without re-prompting. Never throws
 * — decline/undetermined are normal returns, so no caller flow can be blocked.
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (!shouldPromptPermission(alreadyAsked)) return 'undetermined';
  alreadyAsked = true;
  // TODO(#75): replace with `expo-notifications` requestPermissionsAsync()
  // (permission only — token registration stays out of scope).
  return devMockResult;
}
