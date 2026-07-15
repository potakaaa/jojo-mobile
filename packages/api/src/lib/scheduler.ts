/**
 * In-process scheduler substrate (PUSH-004 / #75).
 *
 * SUBSTRATE ONLY — this proves a configured trigger fires exactly once inside its
 * window using an INJECTABLE clock (AC-5). It deliberately does NOT build the
 * specific marketing campaigns (that is PUSH-003's job); the trigger registry is
 * empty in production until a later plan registers real triggers.
 *
 * `tick()` is the injectable-clock entry point tests call directly (no real
 * wall-clock wait needed). `start()` simply wraps `tick` in `setInterval`.
 */

export interface SchedulerTrigger {
  /** Stable id — a trigger fires at most once (dedupe key). */
  id: string;
  /** Fires only when `now` is within `[windowStart, windowEnd)`. */
  windowStart: Date;
  windowEnd: Date;
  /** Side effect to run when the trigger fires (e.g. dispatch a marketing push). */
  onFire: () => void | Promise<void>;
}

export interface Scheduler {
  /** Register a trigger to be evaluated on each `tick()`. */
  register(trigger: SchedulerTrigger): void;
  /** Evaluate every registered trigger against the current clock. */
  tick(): void;
  /** Begin ticking on a real `setInterval` (production entry point). */
  start(): void;
  /** Stop the interval. */
  stop(): void;
}

export interface SchedulerOptions {
  /** Injectable clock — defaults to wall-clock `new Date()`. */
  now?: () => Date;
  /** Interval for `start()`'s `setInterval`. */
  intervalMs: number;
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const now = options.now ?? (() => new Date());
  const triggers = new Map<string, SchedulerTrigger>();
  const fired = new Set<string>();
  let handle: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    const current = now().getTime();
    for (const trigger of triggers.values()) {
      const end = trigger.windowEnd.getTime();
      if (current >= end) {
        // Window has fully passed — purge so dynamically-registered triggers
        // (per-user/per-order) don't accumulate in memory forever.
        triggers.delete(trigger.id);
        fired.delete(trigger.id);
        continue;
      }
      if (fired.has(trigger.id)) continue;
      const start = trigger.windowStart.getTime();
      if (current >= start && current < end) {
        fired.add(trigger.id);
        try {
          const result = trigger.onFire();
          if (result instanceof Promise) {
            result.catch((err: unknown) =>
              console.error(`[scheduler] trigger ${trigger.id} rejected`, err),
            );
          }
        } catch (err) {
          console.error(`[scheduler] trigger ${trigger.id} threw synchronously`, err);
        }
      }
    }
  }

  return {
    register(trigger: SchedulerTrigger): void {
      triggers.set(trigger.id, trigger);
    },
    tick,
    start(): void {
      if (handle) return;
      handle = setInterval(tick, options.intervalMs);
    },
    stop(): void {
      if (handle) {
        clearInterval(handle);
        handle = null;
      }
    },
  };
}
