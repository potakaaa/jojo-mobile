import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetPermissionSeam,
  type PermissionResult,
  promptAndRegisterForPush,
  requestNotificationPermission,
} from '../notification-permission';

/**
 * push-notifications-fixes — AC5–AC8 for the shared `promptAndRegisterForPush`
 * seam (T4/T8). Pure node vitest: the seam composes the two existing functions
 * (`requestNotificationPermission` → on-grant `registerDeviceToken`) and both are
 * exercised WITHOUT React Native rendering or a real OS dialog.
 *
 * AC7 (fire-once) is deliberately driven through the REAL
 * `requestNotificationPermission` (default `deps.request`) so the module-level
 * `alreadyAsked` flag is genuinely exercised — an injected `request` spy would
 * bypass that flag and make the fire-once assertion vacuous (Execute-Agent
 * Instruction E1). In the node env, `typeof __DEV__ === 'undefined'`, so the real
 * seam returns its simulated result (default 'granted') instead of touching
 * native `expo-notifications`.
 */

beforeEach(() => {
  // Reset the session-scoped once-guard so each test starts clean; default the
  // simulated outcome to 'granted'.
  __resetPermissionSeam('granted');
});

describe('promptAndRegisterForPush — AC5/AC6 (grant path)', () => {
  it('AC5 — fires the permission request exactly once per completion', async () => {
    const request = vi.fn<() => Promise<PermissionResult>>().mockResolvedValue('granted');
    const register = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await promptAndRegisterForPush({ request, register });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('AC6 — a grant registers the device token immediately', async () => {
    const request = vi.fn<() => Promise<PermissionResult>>().mockResolvedValue('granted');
    const register = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await promptAndRegisterForPush({ request, register });

    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe('promptAndRegisterForPush — AC7 (shared fire-once flag, REAL seam)', () => {
  it('onboarding ask then checkout ask in one session = one OS request', async () => {
    __resetPermissionSeam('granted');
    // Inject ONLY register (to count invocations); leave `request` as the REAL
    // requestNotificationPermission so the module-level alreadyAsked flag is
    // actually driven (E1 — an injected request spy would bypass it).
    const register = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    // 1st completion (e.g. onboarding): real request → 'granted' → register once.
    await promptAndRegisterForPush({ register });
    expect(register).toHaveBeenCalledTimes(1);

    // 2nd completion (e.g. checkout) in the SAME session: the real request now
    // returns 'undetermined' (fire-once flag already set) → NOT granted → the
    // token is NOT registered a second time.
    await promptAndRegisterForPush({ register });
    expect(register).toHaveBeenCalledTimes(1);

    // Confirm directly at the seam level: every request after the first returns
    // 'undetermined' — the shared flag is what prevented the second OS prompt.
    expect(await requestNotificationPermission()).toBe('undetermined');
  });
});

describe('promptAndRegisterForPush — AC8 (decline never blocks)', () => {
  it('a declined permission never registers a token and never throws', async () => {
    const request = vi.fn<() => Promise<PermissionResult>>().mockResolvedValue('denied');
    const register = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(promptAndRegisterForPush({ request, register })).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });
});
