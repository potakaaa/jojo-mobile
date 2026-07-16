import { describe, expect, it, vi } from 'vitest';

import { createScheduler } from '../scheduler';

/**
 * AC-5 (PUSH-004 / #75) — scheduler substrate.
 *
 * A configured trigger fires exactly once within its window using an INJECTED
 * clock (no real wall-clock wait). Pure — no DB.
 */
describe('createScheduler — AC-5', () => {
  it('fires a configured trigger exactly once within its window (injected clock)', () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const scheduler = createScheduler({ now: () => now, intervalMs: 1000 });
    const onFire = vi.fn();
    scheduler.register({
      id: 't1',
      windowStart: new Date('2026-01-01T00:00:10Z'),
      windowEnd: new Date('2026-01-01T00:00:20Z'),
      onFire,
    });

    // Before the window → no fire.
    now = new Date('2026-01-01T00:00:05Z');
    scheduler.tick();
    expect(onFire).toHaveBeenCalledTimes(0);

    // Inside the window → fires once.
    now = new Date('2026-01-01T00:00:15Z');
    scheduler.tick();
    expect(onFire).toHaveBeenCalledTimes(1);

    // Still inside the window, tick again → NO re-fire (once only).
    scheduler.tick();
    expect(onFire).toHaveBeenCalledTimes(1);

    // After the window → still exactly once.
    now = new Date('2026-01-01T00:00:25Z');
    scheduler.tick();
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not fire a trigger whose window is already in the past on first tick', () => {
    let now = new Date('2026-01-01T00:00:30Z');
    const scheduler = createScheduler({ now: () => now, intervalMs: 1000 });
    const onFire = vi.fn();
    scheduler.register({
      id: 't2',
      windowStart: new Date('2026-01-01T00:00:10Z'),
      windowEnd: new Date('2026-01-01T00:00:20Z'),
      onFire,
    });
    now = new Date('2026-01-01T00:00:35Z');
    scheduler.tick();
    expect(onFire).toHaveBeenCalledTimes(0);
  });

  it('start()/stop() drive tick on a real setInterval', () => {
    vi.useFakeTimers();
    try {
      const scheduler = createScheduler({ intervalMs: 1000 });
      const onFire = vi.fn();
      scheduler.register({
        id: 't3',
        windowStart: new Date(Date.now() - 1000),
        windowEnd: new Date(Date.now() + 60_000),
        onFire,
      });
      scheduler.start();
      vi.advanceTimersByTime(1000);
      expect(onFire).toHaveBeenCalledTimes(1);
      scheduler.stop();
      vi.advanceTimersByTime(5000);
      // Stopped — no further fires (and once-guard holds anyway).
      expect(onFire).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
