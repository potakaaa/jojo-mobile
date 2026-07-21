import { TOAST_AUTO_DISMISS_MS, type ToastSeverity } from '@jojopotato/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastState {
  visible: boolean;
  message: string;
  severity: ToastSeverity;
}

const HIDDEN: ToastState = { visible: false, message: '', severity: 'success' };

export interface UseToastResult {
  toast: ToastState;
  /** Severity defaults to `'success'`, the only severity that auto-dismisses. */
  showToast: (message: string, severity?: ToastSeverity) => void;
  hideToast: () => void;
}

/**
 * Owns one screen's toast state. Replace-latest, no queue: showing a toast while
 * one is already up cancels its pending auto-dismiss and swaps in the new
 * message immediately.
 *
 * Only `'success'` schedules an auto-dismiss timer. `'warning'` and `'error'`
 * schedule nothing at all and stay until tapped — a failure the user never
 * acknowledged must not vanish on its own, which is the guarantee the raw
 * system alert this replaces gave for free.
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
    (message: string, severity: ToastSeverity = 'success') => {
      // Cancel any in-flight auto-dismiss first — otherwise the previous toast's
      // timer would fire on the new message and hide it early.
      clearTimer();
      setToast({ visible: true, message, severity });
      if (severity === 'success') {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setToast((prev) => ({ ...prev, visible: false }));
        }, TOAST_AUTO_DISMISS_MS);
      }
    },
    [clearTimer],
  );

  // Unmounting mid-countdown must not leave a timer that calls setState on an
  // unmounted component.
  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, hideToast };
}
