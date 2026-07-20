/**
 * AC8 (NAV-005): locks the pushed nav object shape for the ONE approved way into
 * Order Tracking. `useNavigateToOrderTracking()` must push
 * `{ pathname: '/(tabs)/tracking', params: { orderId } }` — the STATIC-index
 * anchor route with `orderId` as a query param. If this pathname regresses to the
 * old dynamic `[orderId]` segment, the double-open bug returns.
 *
 * Node-env test: `expo-router`'s `router` is stubbed (no native graph), and
 * `react`'s `useCallback` is stubbed to return its input fn as-is, so the hook can
 * be invoked directly without a React renderer.
 *
 * KNOWN-GAP: the RUNTIME nav-depth effect (Tracking opens once; a single back
 * leaves) is NOT observable here — it is Agent-Probe only (no RN navigation E2E
 * runner in this repo, `mobile-e2e-navigation-harness_NOTE_09-07-26.md`). This test
 * proves only the pushed object's shape.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const pushMock = vi.fn();

vi.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => pushMock(...args),
  },
}));

vi.mock('react', () => ({
  // The hook only uses useCallback; return the fn unchanged so we can invoke it.
  useCallback: <T>(fn: T): T => fn,
}));

// eslint-disable-next-line import/first -- must import AFTER vi.mock() registrations above (hoisting)
import { ORDER_TRACKING_PATHNAME, useNavigateToOrderTracking } from './navigate-to-tracking';

describe('useNavigateToOrderTracking', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  test("should push { pathname: '/(tabs)/tracking', params: { orderId } }", () => {
    const navigate = useNavigateToOrderTracking();
    navigate('O1');
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith({
      pathname: '/(tabs)/tracking',
      params: { orderId: 'O1' },
    });
  });

  test('should target the static-index tracking route, not the dynamic [orderId] segment', () => {
    expect(ORDER_TRACKING_PATHNAME).toBe('/(tabs)/tracking');
  });
});
