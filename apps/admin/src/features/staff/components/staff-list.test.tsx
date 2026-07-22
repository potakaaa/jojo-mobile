import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { StaffList } from './staff-list';
import type { AdminStaffMember } from '../lib/admin-staff-api';
import type { AdminBranch } from '@/features/branches/lib/admin-branches-api';

afterEach(cleanup);

function makeStaff(over: Partial<AdminStaffMember> = {}): AdminStaffMember {
  return {
    id: 's1',
    name: 'Jamie Staff',
    email: 'jamie@example.com',
    role: 'staff',
    assignedBranchId: null,
    branchName: null,
    ...over,
  };
}

function makeBranch(over: Partial<AdminBranch> = {}): AdminBranch {
  return {
    id: 'b1',
    name: 'Downtown',
    slug: 'downtown',
    address: '1 St',
    latitude: 14.5,
    longitude: 120.9,
    phone: '+639170000099',
    openingHours: '08:00-20:00',
    estimatedPrepMinutes: 15,
    isAcceptingPickup: true,
    isActive: true,
    ...over,
  } as AdminBranch;
}

/** Defaults for the ADM-013 Part-B props so existing cases stay focused. */
const partBDefaults = {
  currentUserId: null as string | null,
  onRemove: () => {},
};

test('renders name, email, and the branch select with the assigned value', () => {
  render(
    <StaffList
      staff={[makeStaff({ assignedBranchId: 'b1', branchName: 'Downtown' })]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={false}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      {...partBDefaults}
    />,
  );
  expect(screen.getByText('Jamie Staff')).toBeDefined();
  expect(screen.getByText('jamie@example.com')).toBeDefined();
  const branchSelect = screen.getByLabelText('Branch for jamie@example.com') as HTMLSelectElement;
  expect(branchSelect.value).toBe('b1');
});

test('shows role as a read-only badge for a non-super_admin viewer', () => {
  render(
    <StaffList
      staff={[makeStaff({ role: 'admin' })]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={false}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      {...partBDefaults}
    />,
  );
  expect(screen.getByText('Admin')).toBeDefined();
  expect(screen.queryByLabelText('Role for jamie@example.com')).toBeNull();
});

test('shows a role select (staff/admin/super_admin only, never customer) for a super_admin viewer', () => {
  render(
    <StaffList
      staff={[makeStaff()]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={true}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      {...partBDefaults}
    />,
  );
  const roleSelect = screen.getByLabelText('Role for jamie@example.com') as HTMLSelectElement;
  const optionValues = Array.from(roleSelect.options).map((o) => o.value);
  expect(optionValues).toEqual(['staff', 'admin', 'super_admin']);
  expect(optionValues).not.toContain('customer'); // D4
});

test('fires onBranchChange with the selected id, and null for the empty option', () => {
  const onBranchChange = vi.fn();
  const member = makeStaff({ assignedBranchId: 'b1', branchName: 'Downtown' });
  render(
    <StaffList
      staff={[member]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={false}
      onBranchChange={onBranchChange}
      onRoleChange={() => {}}
      {...partBDefaults}
    />,
  );
  const branchSelect = screen.getByLabelText('Branch for jamie@example.com');
  fireEvent.change(branchSelect, { target: { value: '' } });
  expect(onBranchChange).toHaveBeenCalledWith(member, null);
});

test('fires onRoleChange with the selected role for a super_admin viewer', () => {
  const onRoleChange = vi.fn();
  const member = makeStaff();
  render(
    <StaffList
      staff={[member]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={true}
      onBranchChange={() => {}}
      onRoleChange={onRoleChange}
      {...partBDefaults}
    />,
  );
  const roleSelect = screen.getByLabelText('Role for jamie@example.com');
  fireEvent.change(roleSelect, { target: { value: 'admin' } });
  expect(onRoleChange).toHaveBeenCalledWith(member, 'admin');
});

test('renders the empty state', () => {
  render(
    <StaffList
      staff={[]}
      branches={[]}
      isLoading={false}
      error={null}
      isSuperAdmin={false}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      {...partBDefaults}
    />,
  );
  expect(screen.getByText('No staff members yet.')).toBeDefined();
});

// ADM-013 (#149) Part B — staff removal.
test('renders "Remove from staff" for a non-self row, hides it on the signed-in user\'s own row (AC11)', () => {
  render(
    <StaffList
      staff={[makeStaff({ id: 's1' }), makeStaff({ id: 's2', email: 'other@example.com' })]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={true}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      currentUserId="s1"
      onRemove={() => {}}
    />,
  );
  // Exactly one "Remove from staff" button — the self row (s1) hides it.
  expect(screen.getAllByRole('button', { name: 'Remove from staff' })).toHaveLength(1);
});

test('clicking "Remove from staff" opens the confirm dialog and only calls onRemove after confirming (AC10)', () => {
  const onRemove = vi.fn();
  const member = makeStaff();
  render(
    <StaffList
      staff={[member]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={true}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      currentUserId={null}
      onRemove={onRemove}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove from staff' }));
  // Dialog open; onRemove not yet called.
  expect(screen.getByText(/Remove Jamie Staff from staff\?/)).toBeDefined();
  expect(onRemove).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledWith(member);
});

test('cancelling the remove dialog never calls onRemove', () => {
  const onRemove = vi.fn();
  render(
    <StaffList
      staff={[makeStaff()]}
      branches={[makeBranch()]}
      isLoading={false}
      error={null}
      isSuperAdmin={true}
      onBranchChange={() => {}}
      onRoleChange={() => {}}
      currentUserId={null}
      onRemove={onRemove}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove from staff' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onRemove).not.toHaveBeenCalled();
});
