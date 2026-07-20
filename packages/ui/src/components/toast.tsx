import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Colors,
  FontFamily,
  Palette,
  Radii,
  Shadows,
  Spacing,
  TypeScale,
  type ThemeMode,
} from '../theme';

export type ToastSeverity = 'success' | 'warning' | 'error';

/** How long a `success` toast stays up before auto-dismissing itself (ms). */
export const TOAST_AUTO_DISMISS_MS = 2500;

export interface ToastProps {
  /** Controls mount/visibility. When false the toast renders nothing. */
  visible: boolean;
  /** The single plain-language sentence shown to the user. */
  message: string;
  /** Drives the icon + accent color AND whether the toast auto-dismisses. */
  severity: ToastSeverity;
  mode: ThemeMode;
  /**
   * Distance from the bottom of the toast's screen-root parent, in dp. The
   * caller computes it — Toast deliberately does not read safe-area insets,
   * because the correct clearance depends on the host screen's class (tab-root
   * vs nested) and on whether that screen has a sticky footer.
   */
  bottomOffset: number;
  /** Called on tap, and (for `success` only) when the auto-dismiss timer fires. */
  onDismiss: () => void;
}

const SEVERITY_BACKGROUND: Record<ToastSeverity, string> = {
  success: Palette.green,
  warning: Palette.jorange,
  error: Palette.jred,
};

const SEVERITY_LABEL_COLOR: Record<ToastSeverity, string> = {
  success: Palette.cream,
  warning: Palette.ink,
  error: Palette.cream,
};

/**
 * Naming note: `Badge` calls its most-severe variant `danger`; `Toast` calls the
 * equivalent one `error`. Intentional, not a bug — different components own their
 * own vocabularies, over the same underlying `Palette.jred` token.
 */
const SEVERITY_ICON: Record<ToastSeverity, ComponentProps<typeof Ionicons>['name']> = {
  success: 'checkmark-circle',
  warning: 'warning-outline',
  error: 'alert-circle',
};

/**
 * Shared single-button notice. Replaces raw `Alert.alert()` notices (the ones
 * with nothing to confirm) with one themed, in-app notification language.
 * For a real two-choice decision use `ConfirmDialog` instead.
 *
 * Dismissal is severity-driven, and this is a product-safety rule rather than a
 * cosmetic one: `success` auto-dismisses after `TOAST_AUTO_DISMISS_MS`, while
 * `warning` and `error` require an explicit tap and schedule no timer at all.
 * The raw `Alert.alert()` this replaces could never be silently missed; a
 * failure notice must not quietly regress that guarantee.
 *
 * Rendered as a plain absolutely-positioned overlay (not RN `Modal`), mirroring
 * `confirm-dialog.tsx`: RN `Modal` does not render its children in the jest-expo
 * test tree after a visibility toggle, which would make the per-screen wiring
 * gates untestable. Unlike `ConfirmDialog` it is NOT a full-screen scrim — a
 * notice should not block the rest of the screen — so it is a bottom-anchored
 * card with no backdrop. The overlay is positioned against its screen-root
 * parent, so consumers render it at the screen root.
 */
export function Toast({ visible, message, severity, mode, bottomOffset, onDismiss }: ToastProps) {
  const theme = Colors[mode];

  // Hold the latest callback in a ref so the auto-dismiss effect's deps can stay
  // value-based. With `onDismiss` itself in the dep array, a consumer passing an
  // inline arrow would restart the timer on every render and the toast would
  // never auto-dismiss.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // `message` is a dependency on purpose: replacing one success toast with
  // another must restart the countdown, otherwise the new message inherits the
  // old one's already-running clock and vanishes early.
  useEffect(() => {
    if (!visible || severity !== 'success') return;
    const timer = setTimeout(() => onDismissRef.current(), TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, severity, message]);

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Pressable
        testID="toast-card"
        accessibilityRole="button"
        accessibilityLabel={`Dismiss notification: ${message}`}
        onPress={onDismiss}
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          Shadows.offsetSm,
        ]}
      >
        <View
          testID="toast-icon-chip"
          style={[styles.iconChip, { backgroundColor: SEVERITY_BACKGROUND[severity] }]}
        >
          <Ionicons
            testID="toast-icon"
            name={SEVERITY_ICON[severity]}
            size={16}
            color={SEVERITY_LABEL_COLOR[severity]}
          />
        </View>
        <Text testID="toast-message" style={[styles.message, { color: theme.text }]}>
          {message}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    zIndex: 20,
    elevation: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
    lineHeight: TypeScale.bodySmall * 1.4,
  },
});
