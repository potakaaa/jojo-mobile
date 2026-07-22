import { STAFF_REJECT_REASONS } from '@jojopotato/types';
import type { ThemeMode } from '@jojopotato/ui';

import { ReasonDialog } from '@/features/shared/components/reason-dialog';

export interface RejectReasonDialogProps {
  visible: boolean;
  /** Disables Submit while the reject mutation is in flight. */
  submitting?: boolean;
  onSubmit: (reasonCode: string, note?: string) => void;
  onCancel: () => void;
  mode: ThemeMode;
}

/**
 * Staff reject-with-reason picker (B2). Replaces the plain yes/no `ConfirmDialog`
 * the Reject button used to open, which captured no reason at all.
 *
 * A thin binding over the shared `ReasonDialog` that pins the staff-specific rules:
 *   - a reason is REQUIRED — Submit stays disabled until one is picked (B2.1);
 *   - picking "Other" additionally requires a non-empty note (B2.8).
 * Both rules are re-enforced server-side (422), so this is a UX gate, not the
 * enforcement point.
 *
 * The `onSubmit` signature narrows `reasonCode` to a non-optional `string`, which
 * is sound precisely because `reasonRequired` is set — the shared dialog cannot
 * submit without one.
 */
export function RejectReasonDialog({
  visible,
  submitting = false,
  onSubmit,
  onCancel,
  mode,
}: RejectReasonDialogProps) {
  return (
    <ReasonDialog
      visible={visible}
      submitting={submitting}
      mode={mode}
      title="Reject order?"
      message="Pick a reason. The customer will see it."
      reasons={STAFF_REJECT_REASONS}
      reasonRequired
      requireNoteWhenOther
      submitLabel="Reject"
      submittingLabel="Rejecting…"
      cancelLabel="Keep order"
      testIDPrefix="reject"
      onCancel={onCancel}
      onSubmit={(reasonCode, note) => {
        if (!reasonCode) return; // unreachable: reasonRequired gates Submit
        onSubmit(reasonCode, note);
      }}
    />
  );
}
