/**
 * Notification permission + device-token registration (PUSH-004 / #75).
 *
 * `requestNotificationPermission` now calls the real `expo-notifications`
 * `requestPermissionsAsync()` in a production build; in Expo dev and in the
 * node vitest env it returns a SIMULATED result (`devMockResult`) so the
 * fire-once + decline walkthroughs are exercisable without a real OS dialog and
 * so the pure-TS test suite can import this module without loading native code.
 *
 * `registerDeviceToken` is a SEPARATE, net-new call site: it fetches the real
 * Expo push token and upserts it to `POST /notifications/device-tokens` keyed by
 * a stable per-device id. All native/auth imports inside it are DYNAMIC so the
 * module top-level stays free of React Native / better-auth imports (node vitest
 * imports this file transitively via `notification-factory.test.ts`).
 *
 * The once-flag is session-scoped (module-level in-memory): it resets on a full
 * reload. Real cross-launch persistence is a documented Known Gap.
 */
import type { DeviceTokenRegistration } from '@jojopotato/types';

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
 * True in Expo dev and in the node test env (no real OS dialog is available).
 * Production builds (`__DEV__ === false`) take the real `expo-notifications` path.
 */
function shouldSimulatePermission(): boolean {
  return typeof __DEV__ === 'undefined' || __DEV__ === true;
}

/**
 * Request notification permission. Fires at most once per session; every call
 * after the first returns 'undetermined' without re-prompting. Never throws —
 * decline/undetermined are normal returns, so no caller flow can be blocked.
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (!shouldPromptPermission(alreadyAsked)) return 'undetermined';
  alreadyAsked = true;

  // Dev / test: simulate (no real OS dialog).
  if (shouldSimulatePermission()) return devMockResult;

  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Register (or refresh) this device's Expo push token with the backend. Best
 * effort — never throws; a failure just leaves the device unregistered. Safe to
 * call after `requestNotificationPermission()` returns 'granted'.
 *
 * All imports are DYNAMIC so the module top-level stays node-loadable for the
 * pure-TS vitest suite (this function is never invoked during tests). Runtime
 * behavior (real token + POST) is covered by the AC-7 Agent-Probe walkthrough.
 */
export async function registerDeviceToken(): Promise<void> {
  try {
    const [Notifications, Application, ReactNative, ConstantsModule, ApiRequestModule] =
      await Promise.all([
        import('expo-notifications'),
        import('expo-application'),
        import('react-native'),
        import('expo-constants'),
        import('@/features/shared/lib/api-request'),
      ]);

    const { Platform } = ReactNative;
    const projectId = ConstantsModule.default?.expoConfig?.extra?.eas?.projectId as
      string | undefined;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const pushToken = tokenResponse.data;

    // Stable per-device identifier: iOS identifierForVendor / Android SSAID. The
    // server's `device_id` column accepts any string, so this is a call-site
    // detail only (the (user_id, device_id) upsert key stays independent of the
    // rotating push token).
    const deviceId =
      Platform.OS === 'ios' ? await Application.getIosIdForVendorAsync() : Application.getAndroidId();
    // No stable vendor ID available yet (e.g. simulator, or not yet stabilized on
    // first launch) — best-effort per this function's contract: leave unregistered
    // rather than collide with another install under a shared sentinel id.
    if (!deviceId) return;

    const registration: DeviceTokenRegistration = {
      deviceId,
      pushToken,
      platform: Platform.OS,
    };

    await ApiRequestModule.apiRequest('/notifications/device-tokens', {
      method: 'POST',
      body: registration,
    });
  } catch (err) {
    console.warn('[push] device token registration failed', err);
  }
}
