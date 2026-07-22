import type { ReactNode } from 'react';

import type { AdminCustomerDetail } from '../lib/admin-customers-api';

/**
 * Customer detail view (ADM-010) — PURELY informational. There are NO editable
 * controls anywhere (no input, no save/toggle, no action button) — this is a
 * lookup surface, not an account editor (SPEC AC8 hard requirement). Null fields
 * render a visible "Not set" placeholder rather than a blank gap. Presentational:
 * the parent route supplies the loaded customer + the back navigation (in its
 * PageHeader).
 */
interface CustomerDetailProps {
  customer: AdminCustomerDetail;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not set';
  // A date-only value (YYYY-MM-DD, e.g. birthday) must be parsed as a LOCAL
  // calendar date: `new Date('1996-04-12')` is parsed as UTC midnight and can
  // render the previous day in timezones behind UTC. Full timestamps fall through
  // to normal parsing.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  return date.toLocaleDateString();
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'Not set';
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export function CustomerDetail({ customer }: CustomerDetailProps) {
  return (
    <>
      <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
        <h1 className="font-display text-h2 font-bold text-foreground">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">{customer.email}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border-2 border-foreground p-4 sm:grid-cols-2">
        <h2 className="font-display text-h3 sm:col-span-2">Profile</h2>
        <Field label="Email">{customer.email}</Field>
        <Field label="Phone">{customer.phoneNumber ?? 'Not set'}</Field>
        <Field label="Birthday">{formatDate(customer.birthday)}</Field>
        <Field label="Address">{customer.address ?? 'Not set'}</Field>
        <Field label="Marketing opt-in">{customer.marketingOptIn ? 'Yes' : 'No'}</Field>
        <Field label="Email verified">{customer.emailVerified ? 'Yes' : 'No'}</Field>
        <Field label="Phone verified">{customer.phoneNumberVerified ? 'Yes' : 'No'}</Field>
        <Field label="Favorite branch">{customer.favoriteBranchName ?? 'Not set'}</Field>
        <Field label="Onboarded">{formatDateTime(customer.onboardedAt)}</Field>
        <Field label="Joined">{formatDateTime(customer.createdAt)}</Field>
      </section>

      <section className="flex flex-col gap-1 rounded-xl border-2 border-foreground p-4">
        <h2 className="font-display text-h3">Star balance</h2>
        {customer.starsBalance ? (
          <p className="text-sm text-foreground">
            <span className="font-mono">{customer.starsBalance.current}</span> current ·{' '}
            <span className="font-mono">{customer.starsBalance.lifetime}</span> lifetime
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No star activity yet</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-h3">Recent orders</h2>
        {customer.recentOrders.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border-2 border-foreground">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b-2 border-foreground bg-secondary/40">
                <tr>
                  <th className="px-4 py-2 font-semibold">Order</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Branch</th>
                  <th className="px-4 py-2 font-semibold">Placed</th>
                  <th className="px-4 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {customer.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-foreground/20">
                    <td className="px-4 py-2 font-mono text-xs">{order.orderNumber}</td>
                    <td className="px-4 py-2">{order.status}</td>
                    <td className="px-4 py-2">{order.branchName}</td>
                    <td className="px-4 py-2">{new Date(order.placedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 font-mono text-xs">{formatPeso(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No orders yet</p>
        )}
      </section>
    </>
  );
}
