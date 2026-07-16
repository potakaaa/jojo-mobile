import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontFamily, Radii, Shadows, Spacing, TypeScale, type ThemeMode } from '../theme';
import { Button } from './button';

export type ConfirmDialogVariant = 'default' | 'destructive';

export interface ConfirmDialogProps {
  /** Controls mount/visibility. When false the dialog renders nothing. */
  visible: boolean;
  /** Short, plain-language question (e.g. "Clear your cart?"). */
  title: string;
  /** Optional supporting sentence explaining what will happen. */
  message?: string;
  /** Label for the confirming action (e.g. "Yes, clear it"). */
  confirmLabel: string;
  /** Label for the dismissing action (e.g. "Keep my cart"). */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  mode?: ThemeMode;
  /** `destructive` colors the confirm button as an accent (jred) warning. */
  variant?: ConfirmDialogVariant;
}

/**
 * Shared plain-language confirmation dialog for destructive / hard-to-undo
 * actions (kid-friendly UI pass, AC-A4). Replaces raw `Alert.alert()` confirms
 * with a themed, two-choice card. Selection is fully controlled — the parent
 * owns `visible` and both callbacks — so the underlying action stays unchanged
 * from the pre-dialog behavior.
 *
 * Rendered as a plain absolutely-positioned overlay (not RN `Modal`), mirroring
 * the existing checkout confirm-sheet pattern: RN `Modal` does not render its
 * children in the jest-expo test tree after a visibility toggle, which would
 * make the AC-A4 per-screen wiring gates untestable. The overlay fills its
 * screen-root parent, so consumers render it at the screen root.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  mode = 'light',
  variant = 'default',
}: ConfirmDialogProps) {
  const theme = Colors[mode];
  if (!visible) return null;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${title}`}
        onPress={onCancel}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: theme.background, borderColor: theme.border },
          Shadows.offsetMd,
        ]}
      >
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {message ? (
          <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={cancelLabel}
            variant="outline"
            mode={mode}
            onPress={onCancel}
            style={styles.action}
          />
          <Button
            label={confirmLabel}
            variant={variant === 'destructive' ? 'accent' : 'primary'}
            mode={mode}
            onPress={onConfirm}
            style={styles.action}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
    // Standard modal scrim, matching the existing checkout confirm sheet's
    // backdrop (not a brand token — an established dimming convention).
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: Spacing.four,
    zIndex: 20,
    elevation: 20,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radii.lg,
    borderWidth: 2,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
  },
  message: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    lineHeight: TypeScale.body * 1.4,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  action: {
    flex: 1,
  },
});
