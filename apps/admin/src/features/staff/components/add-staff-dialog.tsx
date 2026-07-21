import { useEffect, useState } from 'react';

import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminBranch } from '@/features/branches/lib/admin-branches-api';

import type { AdminUserLookup, StaffInviteInput, StaffRole } from '../lib/admin-staff-api';

/**
 * "+ Add staff" dialog (ADM-011, Path 1 promote + Path 2 invite). Presentational,
 * mirroring `deal-create-wizard.tsx`'s internal-step pattern: it owns the step/form
 * state and calls the async callbacks the parent wires to the react-query hooks, so it
 * stays trivially testable (no react-query/fetch to mock). The super_admin gate is the
 * parent's job (client-side cosmetic; the server enforces the real 403 boundary).
 *
 * Steps: 'email' → look up an address → route to one of:
 *   - 'found-customer': a promotable customer → pick role (+ branch for staff) → Promote
 *   - 'already-staff':  the account is already staff-level → no-op message
 *   - 'invite':         no account → pick role (+ branch for staff) → send an email invite
 */
type Step = 'email' | 'found-customer' | 'already-staff' | 'invite';

interface AddStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filtered to active branches by the parent. */
  branches: AdminBranch[] | undefined;
  onLookup: (email: string) => Promise<AdminUserLookup | null>;
  onPromote: (args: { userId: string; role: StaffRole; branchId: string | null }) => Promise<void>;
  onInvite: (input: StaffInviteInput) => Promise<void>;
}

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super admin' },
];

const selectClass =
  'h-9 w-full rounded-md border-2 border-border bg-background px-2 text-sm text-foreground';

export function AddStaffDialog({
  open,
  onOpenChange,
  branches,
  onLookup,
  onPromote,
  onInvite,
}: AddStaffDialogProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [foundUser, setFoundUser] = useState<AdminUserLookup | null>(null);
  const [role, setRole] = useState<StaffRole>('staff');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);

  // Reset all state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep('email');
      setEmail('');
      setFoundUser(null);
      setRole('staff');
      setBranchId('');
      setBusy(false);
      setError(null);
      setInvited(false);
    }
  }, [open]);

  const branchRequired = role === 'staff';
  const branchMissing = branchRequired && !branchId;

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const user = await onLookup(email);
      if (!user) {
        setStep('invite');
      } else if (user.role === 'customer') {
        setFoundUser(user);
        setStep('found-customer');
      } else {
        setFoundUser(user);
        setStep('already-staff');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  }

  async function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    if (!foundUser || branchMissing) return;
    setBusy(true);
    setError(null);
    try {
      await onPromote({ userId: foundUser.id, role, branchId: role === 'staff' ? branchId : null });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (branchMissing) return;
    setBusy(true);
    setError(null);
    try {
      await onInvite({
        email,
        intendedRole: role,
        intendedBranchId: role === 'staff' ? branchId : undefined,
      });
      setInvited(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  const roleAndBranchFields = (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Role</span>
        <select
          className={selectClass}
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          aria-label="Role"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {branchRequired ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Branch</span>
          <select
            className={selectClass}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Branch"
          >
            <option value="">Select a branch…</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add staff">
      {step === 'email' ? (
        <form onSubmit={handleLookup} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              aria-label="Email"
              required
            />
          </label>
          <p className="text-sm text-muted-foreground">
            We&apos;ll check for an existing account. If there isn&apos;t one, you can send an email
            invite instead.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !email}>
              {busy ? 'Looking up…' : 'Look up'}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'found-customer' && foundUser ? (
        <form onSubmit={handlePromote} className="mt-4 flex flex-col gap-4">
          <p className="text-sm">
            Promote <span className="font-medium">{foundUser.name}</span> ({foundUser.email}) from
            customer to staff.
          </p>
          {roleAndBranchFields}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || branchMissing}>
              {busy ? 'Promoting…' : 'Promote'}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'already-staff' && foundUser ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm">
            <span className="font-medium">{foundUser.name}</span> ({foundUser.email}) is already a{' '}
            <span className="font-medium">{foundUser.role}</span>. Manage their branch from the
            staff list.
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'invite' ? (
        invited ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm">
              Invite sent to <span className="font-medium">{email}</span>. They&apos;ll get an email
              link to set up their account.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-4">
            <p className="text-sm">
              No account exists for <span className="font-medium">{email}</span>. Send an email
              invite to bring them on as staff.
            </p>
            {roleAndBranchFields}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || branchMissing}>
                {busy ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </form>
        )
      ) : null}
    </FormDialog>
  );
}
