import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TOAST_ACTION_AUTO_DISMISS_MS, TOAST_AUTO_DISMISS_MS } from '@jojopotato/ui';
import { act, renderHook } from '@testing-library/react-native';

import { useToast } from '../use-toast';

/**
 * Runner note: the plan specified this as a vitest `*.test.ts`, but `use-toast.ts`
 * imports `TOAST_AUTO_DISMISS_MS` from `@jojopotato/ui`, whose barrel pulls in
 * react-native. `apps/mobile`'s vitest is `environment: 'node'` with no RN
 * transform and cannot parse that (proven: it dies in react-native's own
 * `index.js`). jest/jest-expo owns `*.test.tsx` and handles it, so the hook's
 * tests live here instead.
 */

/**
 * React/RN schedule several timers of their own during render+act, so a raw
 * `jest.getTimerCount()` delta measures the framework, not this hook. Identify
 * the hook's own timer precisely, by its distinctive auto-dismiss delay.
 */
const spySetTimeout = () => jest.spyOn(global, 'setTimeout');
const spyClearTimeout = () => jest.spyOn(global, 'clearTimeout');
type TimeoutSpy = ReturnType<typeof spySetTimeout>;
type ClearSpy = ReturnType<typeof spyClearTimeout>;

function toastTimerCalls(spy: TimeoutSpy, expectedDelay: number = TOAST_AUTO_DISMISS_MS) {
  return spy.mock.calls.filter(([, delay]) => delay === expectedDelay);
}

/** Any timer the hook could plausibly have scheduled, at either delay. */
function anyToastTimerCalls(spy: TimeoutSpy) {
  return [...toastTimerCalls(spy), ...toastTimerCalls(spy, TOAST_ACTION_AUTO_DISMISS_MS)];
}

describe('useToast', () => {
  let setTimeoutSpy: TimeoutSpy;
  let clearTimeoutSpy: ClearSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    setTimeoutSpy = spySetTimeout();
    clearTimeoutSpy = spyClearTimeout();
  });
  afterEach(() => {
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  test('starts hidden', async () => {
    const { result } = await renderHook(() => useToast());
    expect(result.current.toast.visible).toBe(false);
  });

  test('showToast defaults to the success severity', async () => {
    const { result } = await renderHook(() => useToast());
    await act(async () => {
      result.current.showToast('Added to cart');
    });
    expect(result.current.toast).toMatchObject({
      visible: true,
      message: 'Added to cart',
      severity: 'success',
    });
  });

  test('a success toast auto-hides after TOAST_AUTO_DISMISS_MS', async () => {
    const { result } = await renderHook(() => useToast());
    await act(async () => {
      result.current.showToast('Added to cart', 'success');
    });
    expect(result.current.toast.visible).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });
    expect(result.current.toast.visible).toBe(false);
  });

  // The product-safety rule: a failure the user never acknowledged must stay put.
  test.each(['warning', 'error'] as const)(
    'a %s toast schedules no timer and never auto-hides',
    async (severity) => {
      const { result } = await renderHook(() => useToast());

      await act(async () => {
        result.current.showToast('Something went wrong', severity);
      });
      // Scheduled NOTHING — not merely "a longer timeout".
      expect(toastTimerCalls(setTimeoutSpy)).toHaveLength(0);

      await act(async () => {
        jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 100);
      });
      expect(result.current.toast.visible).toBe(true);
      expect(result.current.toast.severity).toBe(severity);
    },
  );

  test('hideToast hides an in-flight toast immediately', async () => {
    const { result } = await renderHook(() => useToast());
    await act(async () => {
      result.current.showToast('Something went wrong', 'error');
    });
    await act(async () => {
      result.current.hideToast();
    });
    expect(result.current.toast.visible).toBe(false);
  });

  test('replace-latest: a second showToast swaps in the new message, no queue', async () => {
    const { result } = await renderHook(() => useToast());
    await act(async () => {
      result.current.showToast('first');
    });
    await act(async () => {
      result.current.showToast('second', 'warning');
    });

    expect(result.current.toast).toMatchObject({
      visible: true,
      message: 'second',
      severity: 'warning',
    });

    // The first toast's success timer must have been cancelled. If it survived,
    // it would fire here and wrongly hide the warning that replaced it.
    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 2);
    });
    expect(result.current.toast.visible).toBe(true);
    expect(result.current.toast.message).toBe('second');
  });

  test('replacing one success toast with another restarts the countdown', async () => {
    const { result } = await renderHook(() => useToast());
    await act(async () => {
      result.current.showToast('first');
    });
    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 500);
    });
    await act(async () => {
      result.current.showToast('second');
    });

    // The first toast's clock would have expired by now.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(result.current.toast.visible).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });
    expect(result.current.toast.visible).toBe(false);
  });

  test('unmounting mid-countdown clears the pending timer (no leak, no setState after unmount)', async () => {
    const { result, unmount } = await renderHook(() => useToast());

    await act(async () => {
      result.current.showToast('Added to cart');
    });
    const scheduled = toastTimerCalls(setTimeoutSpy);
    expect(scheduled).toHaveLength(1);

    // The id the hook actually holds — asserting THIS id gets cleared proves the
    // cleanup releases the hook's own timer, not merely that clearTimeout ran.
    const scheduledIndex = setTimeoutSpy.mock.calls.findIndex(
      ([, delay]) => delay === TOAST_AUTO_DISMISS_MS,
    );
    const timerId = setTimeoutSpy.mock.results[scheduledIndex]?.value;
    expect(timerId).toBeDefined();

    await unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
  });

  /* ---------------------------------------------------------------- *
   * Optional third argument — the trailing action passthrough
   * ---------------------------------------------------------------- */

  describe('action passthrough', () => {
    // Backward compatibility: the two existing arities carry no action.
    test('no action is carried when showToast is called the old way', async () => {
      const { result } = await renderHook(() => useToast());
      await act(async () => {
        result.current.showToast('Added to cart', 'success');
      });
      expect(result.current.toast.actionLabel).toBeUndefined();
      expect(result.current.toast.onAction).toBeUndefined();
    });

    // Title deliberately avoids a literal `<Toast>`: check-theme-mode.mjs scans
    // string literals, so a component tag in a test name reads as a call site.
    test('an action is surfaced as the flat actionLabel/onAction pair', async () => {
      const onPress = jest.fn();
      const { result } = await renderHook(() => useToast());
      await act(async () => {
        result.current.showToast('Added to cart', 'success', { label: 'View cart', onPress });
      });
      expect(result.current.toast.actionLabel).toBe('View cart');
      result.current.toast.onAction?.();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    // Replace-latest: the new toast's shape is exactly what its call described,
    // so a stale action must not linger and send the user somewhere unrelated.
    test('a following action-less toast clears the previous action', async () => {
      const { result } = await renderHook(() => useToast());
      await act(async () => {
        result.current.showToast('Added to cart', 'success', {
          label: 'View cart',
          onPress: jest.fn(),
        });
      });
      expect(result.current.toast.actionLabel).toBe('View cart');

      await act(async () => {
        result.current.showToast('Could not add item', 'error');
      });
      expect(result.current.toast.actionLabel).toBeUndefined();
      expect(result.current.toast.onAction).toBeUndefined();
    });

    // Severity remains the SOLE decider of WHETHER a timer exists at all — a
    // warning carrying an action still schedules nothing, at either delay.
    test('a warning with an action still schedules no timer', async () => {
      const { result } = await renderHook(() => useToast());
      await act(async () => {
        result.current.showToast('Deal removed', 'warning', {
          label: 'View cart',
          onPress: jest.fn(),
        });
      });
      expect(anyToastTimerCalls(setTimeoutSpy)).toHaveLength(0);
      await act(async () => {
        jest.advanceTimersByTime(TOAST_ACTION_AUTO_DISMISS_MS * 10);
      });
      expect(result.current.toast.visible).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- *
   * The second axis — action-presence decides HOW LONG a success lasts
   * ---------------------------------------------------------------- */

  describe('action-aware auto-dismiss window', () => {
    // The whole point of the longer window: at the old 2500ms mark the toast
    // must STILL be on screen, so the user has time to reach the action.
    test('a success WITH an action outlives TOAST_AUTO_DISMISS_MS and goes at TOAST_ACTION_AUTO_DISMISS_MS', async () => {
      const { result } = await renderHook(() => useToast());
      await act(async () => {
        result.current.showToast('Added to cart', 'success', {
          label: 'View cart',
          onPress: jest.fn(),
        });
      });
      expect(toastTimerCalls(setTimeoutSpy, TOAST_ACTION_AUTO_DISMISS_MS)).toHaveLength(1);
      expect(toastTimerCalls(setTimeoutSpy)).toHaveLength(0);

      await act(async () => {
        jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
      });
      expect(result.current.toast.visible).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(TOAST_ACTION_AUTO_DISMISS_MS - TOAST_AUTO_DISMISS_MS);
      });
      expect(result.current.toast.visible).toBe(false);
    });

    // Backward compatibility: an action-less success is untouched.
    test('a success WITHOUT an action still goes at TOAST_AUTO_DISMISS_MS', async () => {
      const { result } = await renderHook(() => useToast());
      await act(async () => {
        result.current.showToast('Item updated', 'success');
      });
      expect(toastTimerCalls(setTimeoutSpy)).toHaveLength(1);
      expect(toastTimerCalls(setTimeoutSpy, TOAST_ACTION_AUTO_DISMISS_MS)).toHaveLength(0);

      await act(async () => {
        jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
      });
      expect(result.current.toast.visible).toBe(false);
    });

    // Two constants, not one. If someone "simplifies" them back together, this
    // is the test that goes red.
    test('the two windows are genuinely different durations', () => {
      expect(TOAST_ACTION_AUTO_DISMISS_MS).toBeGreaterThan(TOAST_AUTO_DISMISS_MS);
    });
  });
});
