import {
  TOAST_ACTION_AUTO_DISMISS_MS,
  TOAST_AUTO_DISMISS_MS,
  type ToastSeverity,
} from '@jojopotato/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastState {
  visible: boolean;
  message: string;
  severity: ToastSeverity;
  /**
   * Optional trailing call-to-action, mirroring `ToastProps`' flat pair so the
   * screen can thread them straight through to `<Toast>` 1:1. Absent on every
   * toast raised by the two-argument `showToast(message, severity)` form.
   */
  actionLabel?: string;
  onAction?: () => void;
}

/** The optional third argument of `showToast`. */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

const HIDDEN: ToastState = { visible: false, message: '', severity: 'success' };

export interface UseToastResult {
  toast: ToastState;
  /**
   * Severity defaults to `'success'`, the only severity that auto-dismisses.
   * `action` is optional and purely additive — `showToast(message)` and
   * `showToast(message, severity)` behave exactly as they always have.
   */
  showToast: (message: string, severity?: ToastSeverity, action?: ToastAction) => void;
  hideToast: () => void;
}

/**
 * Owns one screen's toast state. Replace-latest, no queue: showing a toast while
 * one is already up cancels its pending auto-dismiss and swaps in the new
 * message immediately.
 *
 * Auto-dismiss has TWO independent axes — do not collapse them:
 *
 *   - SEVERITY decides WHETHER a timer is scheduled. Only `'success'` schedules
 *     one. `'warning'` and `'error'` schedule nothing at all and stay until
 *     tapped — a failure the user never acknowledged must not vanish on its own,
 *     which is the guarantee the raw system alert this replaces gave for free.
 *   - ACTION-PRESENCE decides HOW LONG a `'success'` one lasts:
 *     `TOAST_ACTION_AUTO_DISMISS_MS` when it carries an action, plain
 *     `TOAST_AUTO_DISMISS_MS` when it does not. A toast the user is meant to
 *     TAP needs longer than one they only have to read.
 *
 * Consumers render `<Toast>` at their SCREEN ROOT and pass the three state
 * fields explicitly (never a `{...toast}` spread — `check-theme-mode.mjs`
 * hard-fails on spread attributes at a themed component's call site).
 */
export function useToast(): UseToastResult {
  const [toast, setToast] = useState<ToastState>(HIDDEN);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimer();
    setToast((prev) => ({ ...prev, visible: false }));
  }, [clearTimer]);

  const showToast = useCallback(
    (message: string, severity: ToastSeverity = 'success', action?: ToastAction) => {
      // Cancel any in-flight auto-dismiss first — otherwise the previous toast's
      // timer would fire on the new message and hide it early.
      clearTimer();
      // An action is NOT carried over from the previous toast: replace-latest
      // means the new toast's shape is exactly what this call described.
      setToast({
        visible: true,
        message,
        severity,
        actionLabel: action?.label,
        onAction: action?.onPress,
      });
      // Severity still decides WHETHER; action-presence decides HOW LONG.
      // `<Toast>` runs its own parallel timer off the same two constants — if
      // the two ever disagreed, the shorter delay would win and silently defeat
      // the longer window.
      if (severity === 'success') {
        const delay = action ? TOAST_ACTION_AUTO_DISMISS_MS : TOAST_AUTO_DISMISS_MS;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setToast((prev) => ({ ...prev, visible: false }));
        }, delay);
      }
    },
    [clearTimer],
  );

  // Unmounting mid-countdown must not leave a timer that calls setState on an
  // unmounted component.
  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, hideToast };
}
