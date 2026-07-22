import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { AdminBranch } from '@/features/branches/lib/admin-branches-api';

import type { AdminUserLookup } from '../lib/admin-staff-api';

import { AddStaffDialog } from './add-staff-dialog';

afterEach(cleanup);

const branches = [
  { id: 'b1', name: 'Branch One' },
  { id: 'b2', name: 'Branch Two' },
] as unknown as AdminBranch[];

function renderDialog(
  overrides: {
    onLookup?: (email: string) => Promise<AdminUserLookup | null>;
    onPromote?: (args: {
      userId: string;
      role: 'staff' | 'admin' | 'super_admin';
      branchId: string | null;
    }) => Promise<void>;
    onInvite?: (input: unknown) => Promise<void>;
  } = {},
) {
  const onLookup = overrides.onLookup ?? vi.fn().mockResolvedValue(null);
  const onPromote = overrides.onPromote ?? vi.fn().mockResolvedValue(undefined);
  const onInvite = overrides.onInvite ?? vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <AddStaffDialog
      open
      onOpenChange={onOpenChange}
      branches={branches}
      onLookup={onLookup}
      onPromote={onPromote as never}
      onInvite={onInvite as never}
    />,
  );
  return { onLookup, onPromote, onInvite, onOpenChange };
}

test('a not-found lookup routes to the invite step and sends the invite with the stored role/branch', async () => {
  const { onLookup, onInvite } = renderDialog();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

  await waitFor(() => expect(onLookup).toHaveBeenCalledWith('new@example.com'));
  await screen.findByText(/No account exists/);

  // Role defaults to staff → a branch is required.
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'b2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

  await waitFor(() =>
    expect(onInvite).toHaveBeenCalledWith({
      email: 'new@example.com',
      intendedRole: 'staff',
      intendedBranchId: 'b2',
    }),
  );
});

test('a found customer routes to the promote step; promoting to admin sends no branch', async () => {
  const onLookup = vi
    .fn()
    .mockResolvedValue({ id: 'u1', name: 'Jo', email: 'jo@example.com', role: 'customer' });
  const { onPromote } = renderDialog({ onLookup });

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jo@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

  await screen.findByRole('button', { name: 'Promote' });
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });
  // The branch field disappears for a non-staff role.
  expect(screen.queryByLabelText('Branch')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Promote' }));

  await waitFor(() =>
    expect(onPromote).toHaveBeenCalledWith({ userId: 'u1', role: 'admin', branchId: null }),
  );
});

test('a found customer promoted to staff sends the selected branch', async () => {
  const onLookup = vi
    .fn()
    .mockResolvedValue({ id: 'u1', name: 'Jo', email: 'jo@example.com', role: 'customer' });
  const { onPromote } = renderDialog({ onLookup });

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jo@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

  await screen.findByRole('button', { name: 'Promote' });
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'b1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Promote' }));

  await waitFor(() =>
    expect(onPromote).toHaveBeenCalledWith({ userId: 'u1', role: 'staff', branchId: 'b1' }),
  );
});

test('an already-staff account shows a no-op message and never promotes', async () => {
  const onLookup = vi
    .fn()
    .mockResolvedValue({ id: 'u2', name: 'Al', email: 'al@example.com', role: 'admin' });
  const { onPromote, onInvite } = renderDialog({ onLookup });

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'al@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

  await screen.findByText(/is already a/);
  expect(onPromote).not.toHaveBeenCalled();
  expect(onInvite).not.toHaveBeenCalled();
});

test('promoting a staff target is blocked until a branch is chosen', async () => {
  const onLookup = vi
    .fn()
    .mockResolvedValue({ id: 'u1', name: 'Jo', email: 'jo@example.com', role: 'customer' });
  const { onPromote } = renderDialog({ onLookup });

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jo@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

  await screen.findByRole('button', { name: 'Promote' });
  // No branch selected yet → the Promote button is disabled.
  expect((screen.getByRole('button', { name: 'Promote' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(onPromote).not.toHaveBeenCalled();
});
