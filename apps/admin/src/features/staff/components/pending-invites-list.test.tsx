import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PendingInvitesList } from './pending-invites-list';
import type { AdminPendingStaffInvite } from '../lib/admin-staff-api';

afterEach(cleanup);

function makeInvite(over: Partial<AdminPendingStaffInvite> = {}): AdminPendingStaffInvite {
  return {
    id: 'i1',
    email: 'invitee@example.com',
    intendedRole: 'staff',
    intendedBranchId: 'b1',
    intendedBranchName: 'Downtown',
    invitedByName: 'Sam Super',
    invitedByEmail: 'sam@example.com',
    createdAt: '2026-07-20T10:00:00.000Z',
    expiresAt: '2026-07-27T10:00:00.000Z',
    ...over,
  };
}

function renderList(
  over: {
    invites?: AdminPendingStaffInvite[];
    onRevoke?: (invite: AdminPendingStaffInvite) => void;
    onResend?: (invite: AdminPendingStaffInvite) => void;
    revokePendingId?: string | null;
    resendPendingId?: string | null;
  } = {},
) {
  const onRevoke = over.onRevoke ?? vi.fn();
  const onResend = over.onResend ?? vi.fn();
  render(
    <PendingInvitesList
      invites={over.invites ?? [makeInvite()]}
      isLoading={false}
      error={null}
      onRevoke={onRevoke}
      onResend={onResend}
      revokePendingId={over.revokePendingId ?? null}
      resendPendingId={over.resendPendingId ?? null}
      revokeError={null}
    />,
  );
  return { onRevoke, onResend };
}

test('renders a pending invite row with email, role, branch, and inviter', () => {
  renderList();
  expect(screen.getByText('invitee@example.com')).toBeDefined();
  expect(screen.getByText('Staff')).toBeDefined();
  expect(screen.getByText('Downtown')).toBeDefined();
  expect(screen.getByText('Sam Super')).toBeDefined();
});

test('renders "—" for an invite with no branch', () => {
  renderList({
    invites: [
      makeInvite({ intendedRole: 'admin', intendedBranchId: null, intendedBranchName: null }),
    ],
  });
  expect(screen.getByText('—')).toBeDefined();
});

test('clicking Revoke opens the confirm dialog and does NOT call onRevoke until confirmed', () => {
  const { onRevoke } = renderList();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

  // The confirm dialog is now open, but onRevoke has not been called yet.
  expect(screen.getByText(/Revoke invite for invitee@example.com/)).toBeDefined();
  expect(onRevoke).not.toHaveBeenCalled();

  // Confirm inside the dialog (the dialog's own "Revoke" button).
  const confirmButtons = screen.getAllByRole('button', { name: 'Revoke' });
  fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
  expect(onRevoke).toHaveBeenCalledTimes(1);
  expect(onRevoke).toHaveBeenCalledWith(makeInvite());
});

test('cancelling the revoke dialog never calls onRevoke', () => {
  const { onRevoke } = renderList();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onRevoke).not.toHaveBeenCalled();
});

test('clicking Resend calls onResend directly with no confirm dialog', () => {
  const { onResend } = renderList();
  fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
  expect(onResend).toHaveBeenCalledTimes(1);
  expect(onResend).toHaveBeenCalledWith(makeInvite());
  // No confirm dialog copy for resend.
  expect(screen.queryByText(/Revoke invite for/)).toBeNull();
});

test('renders the empty state when there are no pending invites', () => {
  renderList({ invites: [] });
  expect(screen.getByText('No pending invites.')).toBeDefined();
});
