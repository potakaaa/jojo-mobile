import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
  mode: ThemeMode;
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
 * Rendered in an RN `Modal` so the scrim covers the ENTIRE device screen. An
 * in-screen absolutely-positioned overlay cannot: RN resolves `position:absolute`
 * against the parent's padding box, so nested under a `SafeAreaView` the scrim
 * stopped at the safe-area inset, and it could never dim the floating tab bar
 * (which renders in the navigator's layer, above any screen). Both showed up as
 * a darkened rectangle inset from the real screen bounds.
 *
 * `statusBarTranslucent` + `navigationBarTranslucent` extend the modal window
 * under the Android system bars — without them the scrim stops at the status bar
 * and the same seam reappears at the top.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  mode,
  variant = 'default',
}: ConfirmDialogProps) {
  const theme = Colors[mode];
  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
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
            {/*
              Stable testIDs: the dialog's labels are caller-supplied and often
              duplicate a button already on the screen behind it (e.g. staff
              order-detail's "Reject"), so a label-based query is ambiguous.
            */}
            <Button
              testID="confirm-dialog-cancel"
              label={cancelLabel}
              variant="outline"
              size="sm"
              mode={mode}
              onPress={onCancel}
              style={styles.action}
            />
            <Button
              testID="confirm-dialog-confirm"
              label={confirmLabel}
              variant={variant === 'destructive' ? 'accent' : 'primary'}
              size="sm"
              mode={mode}
              onPress={onConfirm}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Fills the Modal's own window, which already spans the whole device screen.
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    // Brand-ink scrim at a lighter opacity than the old flat rgba(0,0,0,0.4) —
    // pure black over the warm cream background read as a muddy, overly heavy
    // gray wash (reported as "the outside box is darkened"). Palette.ink is
    // already the app's near-black text/border color, so a lighter tint of it
    // dims the backdrop without looking washed-out or off-brand.
    backgroundColor: `${Palette.ink}59`, // ink at ~35% opacity (0x59 / 0xff)
    padding: Spacing.four,
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
    // Two buttons share the card width, so each gets ~half of it. Trim the side
    // padding below even the Button default so caller-supplied labels — which
    // can be long ("Stay signed in", "Clear and switch") — stay on one line.
    paddingHorizontal: Spacing.two,
  },
});
