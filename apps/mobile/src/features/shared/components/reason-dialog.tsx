import { Button, Colors, Input, type ThemeMode } from '@jojopotato/ui';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme';

export interface ReasonOption {
  readonly code: string;
  readonly label: string;
}

export interface ReasonDialogProps {
  visible: boolean;
  /** Disables Submit while the backing mutation is in flight. */
  submitting?: boolean;
  mode: ThemeMode;
  title: string;
  message?: string;
  reasons: readonly ReasonOption[];
  /** When true, Submit stays disabled until a reason is picked (B2.1). */
  reasonRequired?: boolean;
  /** When true, picking the `other` code additionally requires a note (B2.8). */
  requireNoteWhenOther?: boolean;
  submitLabel: string;
  submittingLabel: string;
  cancelLabel: string;
  /** Prefix for the `testID`s on the reason rows and the two action buttons. */
  testIDPrefix: string;
  onSubmit: (reasonCode: string | undefined, note: string | undefined) => void;
  onCancel: () => void;
}

/**
 * Shared "pick a reason (+ optional note)" dialog, used by BOTH terminal-transition
 * flows: staff reject (reason REQUIRED, `other` requires a note) and customer cancel
 * (reason fully optional). The two differ only in gating, so they share one
 * component rather than duplicating the modal layout twice.
 *
 * NOT added to `@jojopotato/ui`: that package's `ConfirmDialog` is a fixed
 * two-button, no-input contract with many callers, and this dialog is currently
 * app-specific (it renders a domain reason list). Structure, scrim colour, and the
 * `statusBarTranslucent`/`navigationBarTranslucent` flags copy `ConfirmDialog`
 * exactly so the dialogs look and behave identically.
 *
 * Every gate here is a UX convenience only — the server independently enforces the
 * same rules and 422s a bad request, so a bypassed client gate cannot persist an
 * invalid reason.
 */
export function ReasonDialog({
  visible,
  submitting = false,
  mode,
  title,
  message,
  reasons,
  reasonRequired = false,
  requireNoteWhenOther = false,
  submitLabel,
  submittingLabel,
  cancelLabel,
  testIDPrefix,
  onSubmit,
  onCancel,
}: ReasonDialogProps) {
  const theme = Colors[mode];
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const needsNote = requireNoteWhenOther && reasonCode === 'other';
  const reasonOk = !reasonRequired || reasonCode !== null;
  const noteOk = !needsNote || note.trim().length > 0;
  const canSubmit = reasonOk && noteOk && !submitting;

  function reset() {
    setReasonCode(null);
    setNote('');
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const trimmed = note.trim();
    onSubmit(reasonCode ?? undefined, trimmed.length > 0 ? trimmed : undefined);
    reset();
  }

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${title}`}
          onPress={handleCancel}
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

          <ScrollView style={styles.reasonList} keyboardShouldPersistTaps="handled">
            {reasons.map((reason) => {
              const selected = reasonCode === reason.code;
              return (
                <Pressable
                  key={reason.code}
                  testID={`${testIDPrefix}-reason-${reason.code}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  // Tapping the selected row again clears it — the only way to get
                  // back to "no reason" on the customer flow, where none is valid.
                  onPress={() => setReasonCode(selected && !reasonRequired ? null : reason.code)}
                  style={[
                    styles.reasonRow,
                    { borderColor: selected ? theme.tint : theme.border },
                    selected ? { backgroundColor: theme.backgroundSelected } : null,
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? theme.tint : theme.border },
                      selected ? { backgroundColor: theme.tint } : null,
                    ]}
                  />
                  <Text style={[styles.reasonLabel, { color: theme.text }]}>{reason.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* `Input` exposes no `testID` prop — `accessibilityLabel` is its
              documented query handle (see InputProps), so tests target that. */}
          <Input
            accessibilityLabel={`${testIDPrefix}-note`}
            mode={mode}
            label={needsNote ? 'Note (required)' : 'Note (optional)'}
            placeholder={needsNote ? 'Add a short explanation' : 'Add any detail'}
            value={note}
            onChangeText={setNote}
          />

          <View style={styles.actions}>
            <Button
              testID={`${testIDPrefix}-cancel`}
              label={cancelLabel}
              variant="outline"
              size="sm"
              mode={mode}
              onPress={handleCancel}
              style={styles.action}
            />
            <Button
              testID={`${testIDPrefix}-submit`}
              label={submitting ? submittingLabel : submitLabel}
              variant="accent"
              size="sm"
              mode={mode}
              disabled={!canSubmit}
              onPress={handleSubmit}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: `${Palette.ink}59`,
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
  reasonList: {
    maxHeight: 240,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
    borderWidth: 2,
    borderRadius: Radii.md,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: Radii.full,
    borderWidth: 2,
  },
  reasonLabel: {
    flex: 1,
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.two,
  },
});
