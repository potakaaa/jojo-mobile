import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TOAST_AUTO_DISMISS_MS } from '@jojopotato/ui';
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

function toastTimerCalls(spy: TimeoutSpy) {
  return spy.mock.calls.filter(([, delay]) => delay === TOAST_AUTO_DISMISS_MS);
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
});
