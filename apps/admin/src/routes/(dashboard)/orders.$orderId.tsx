import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';

import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { StatusBadge } from '@/components/status-badge';
import { useAdminOrder } from '@/features/orders/hooks/use-admin-orders';
import { orderStatusLabel, orderStatusTone } from '@/features/orders/lib/admin-orders-api';

export const Route = createFileRoute('/(dashboard)/orders/$orderId')({
  component: OrderDetailPage,
});

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

/**
 * Order detail screen (ADM-006) — READ-ONLY. Sibling child route of `(dashboard)`,
 * admin-guarded, mounted into `orders.tsx`'s `<Outlet/>`. Shows the order header,
 * the customer identity block (name + phone ONLY — PII boundary D2), branch, the
 * item snapshot table, and the totals/discount-context block. No action buttons —
 * status transitions remain a staff action (D1).
 */
function OrderDetailPage() {
  const { orderId } = useParams({ from: '/(dashboard)/orders/$orderId' });
  const navigate = useNavigate();
  const orderQuery = useAdminOrder(orderId);
  const order = orderQuery.data;

  // Subtotal is not carried on the staff-detail shape; derive it for display.
  const subtotalCents = order
    ? order.items.reduce((sum, item) => sum + item.totalPriceCents, 0)
    : 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Order"
        backLabel="← Orders"
        onBack={() => void navigate({ to: '/orders' })}
      />

      <QueryStates
        isLoading={orderQuery.isLoading}
        error={orderQuery.error}
        isEmpty={!order}
        loadingLabel="Loading order…"
        errorLabel="Failed to load order"
        emptyLabel="Order not found."
      >
        {order ? (
          <>
            <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-h2 font-bold text-foreground">
                  {order.orderNumber}
                </h1>
                <StatusBadge tone={orderStatusTone(order.status)}>
                  {orderStatusLabel(order.status)}
                </StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                Placed {formatDateTime(order.placedAt)} · Est. ready{' '}
                {formatDateTime(order.estimatedReadyAt)}
              </p>
            </section>

            <section className="flex flex-col gap-1 rounded-xl border-2 border-foreground p-4">
              <h2 className="font-display text-h3">Customer</h2>
              <p className="text-sm text-foreground">{order.customerName}</p>
              <p className="text-sm text-muted-foreground">
                {order.customerPhone ?? 'No phone on file'}
              </p>
            </section>

            <section className="flex flex-col gap-1 rounded-xl border-2 border-foreground p-4">
              <h2 className="font-display text-h3">Branch</h2>
              <p className="text-sm text-foreground">{order.branchName}</p>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="font-display text-h3">Items</h2>
              <div className="overflow-x-auto rounded-xl border-2 border-foreground">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b-2 border-foreground bg-secondary/40">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Item</th>
                      <th className="px-4 py-2 font-semibold">Qty</th>
                      <th className="px-4 py-2 font-semibold">Unit</th>
                      <th className="px-4 py-2 font-semibold">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => (
                      <tr
                        key={`${item.productId}-${idx}`}
                        className="border-b border-foreground/20"
                      >
                        <td className="px-4 py-2">
                          <span className="font-medium">{item.productName}</span>
                          {item.selectedOptions.length > 0 ? (
                            <span className="block text-xs text-muted-foreground">
                              {item.selectedOptions.map((opt) => opt.name).join(', ')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{item.quantity}</td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {formatPeso(item.unitPriceCents)}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {formatPeso(item.totalPriceCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-col gap-1 rounded-xl border-2 border-foreground p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatPeso(subtotalCents)}</span>
              </div>
              {order.discountTotalCents > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-mono">−{formatPeso(order.discountTotalCents)}</span>
                </div>
              ) : null}
              {order.couponId ? (
                <p className="text-xs text-muted-foreground">Coupon: {order.couponId}</p>
              ) : null}
              {order.dealId ? (
                <p className="text-xs text-muted-foreground">Deal: {order.dealId}</p>
              ) : null}
              <div className="mt-1 flex justify-between border-t-2 border-foreground pt-2 text-base font-bold">
                <span>Total</span>
                <span className="font-mono">{formatPeso(order.totalCents)}</span>
              </div>
            </section>
          </>
        ) : null}
      </QueryStates>
    </main>
  );
}
