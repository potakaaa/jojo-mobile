import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';

import { RejectReasonDialog } from '@/features/staff/components/reject-reason-dialog';
import { renderWithProviders } from '@/test-utils/render';

/**
 * B2.1 + B2.8 client-gate coverage for the staff reject dialog.
 *
 * These prove the UX gate only. The SERVER independently enforces both rules and
 * 422s a bad request (`order-reasons.integration.test.ts`), so a bypassed client
 * gate can never persist an invalid reason — that is why these are the mobile
 * half of B2.1/B2.8 and not their whole proof.
 *
 * Non-vacuity: dropping `reasonRequired` turns the B2.1 case red; dropping
 * `requireNoteWhenOther` turns the B2.8 case red (both verified during EXECUTE).
 */

const onSubmit = jest.fn();
const onCancel = jest.fn();

function renderDialog() {
  return renderWithProviders(
    <RejectReasonDialog visible mode="light" onSubmit={onSubmit} onCancel={onCancel} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('B2.1 — a reason is required before the reject can be sent', () => {
  test('submitting with no reason selected sends nothing', async () => {
    const { getByTestId } = await renderDialog();

    await fireEvent.press(getByTestId('reject-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('picking a preset reason enables submit and sends that code', async () => {
    const { getByTestId } = await renderDialog();

    await fireEvent.press(getByTestId('reject-reason-out_of_stock'));
    await fireEvent.press(getByTestId('reject-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('out_of_stock', undefined);
  });

  test('a note is optional for a non-"other" reason and is forwarded when given', async () => {
    const { getByTestId, getByLabelText } = await renderDialog();

    await fireEvent.press(getByTestId('reject-reason-branch_busy'));
    await fireEvent.changeText(getByLabelText('reject-note'), 'Queue is 40 deep');
    await fireEvent.press(getByTestId('reject-submit'));

    expect(onSubmit).toHaveBeenCalledWith('branch_busy', 'Queue is 40 deep');
  });
});

describe('B2.8 — "Other" additionally requires a non-empty note', () => {
  test('selecting Other with no note sends nothing', async () => {
    const { getByTestId } = await renderDialog();

    await fireEvent.press(getByTestId('reject-reason-other'));
    await fireEvent.press(getByTestId('reject-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('selecting Other with a whitespace-only note sends nothing', async () => {
    const { getByTestId, getByLabelText } = await renderDialog();

    await fireEvent.press(getByTestId('reject-reason-other'));
    await fireEvent.changeText(getByLabelText('reject-note'), '    ');
    await fireEvent.press(getByTestId('reject-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('selecting Other with a real note sends both code and trimmed note', async () => {
    const { getByTestId, getByLabelText } = await renderDialog();

    await fireEvent.press(getByTestId('reject-reason-other'));
    await fireEvent.changeText(getByLabelText('reject-note'), '  Freezer broke  ');
    await fireEvent.press(getByTestId('reject-submit'));

    expect(onSubmit).toHaveBeenCalledWith('other', 'Freezer broke');
  });
});

describe('cancelling the dialog', () => {
  test('cancel sends nothing and reports the dismissal', async () => {
    const { getByTestId } = await renderDialog();

    await fireEvent.press(getByTestId('reject-reason-out_of_stock'));
    await fireEvent.press(getByTestId('reject-cancel'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
