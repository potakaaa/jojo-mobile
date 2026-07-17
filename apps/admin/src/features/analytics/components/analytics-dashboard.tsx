import type { AdminAnalytics } from '@jojopotato/types';

import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';

import { BranchOrdersTable } from './branch-orders-table';
import { MetricCard } from './metric-card';
import { TimeRangePicker, type DateRange } from './time-range-picker';
import { TopProductsTable } from './top-products-table';

/**
 * Analytics dashboard (ADM-007) — presentational. Kept separate from the route
 * file so it renders directly in jsdom tests with a mocked payload (AC9 wiring
 * half). Composes `PageHeader`, `TimeRangePicker`, `QueryStates`, and the two
 * `DataTable`-backed tables, plus the scalar metric cards. Read-only; no chart
 * library (D6).
 */
interface AnalyticsDashboardProps {
  data: AdminAnalytics | undefined;
  isLoading: boolean;
  error: unknown;
  range: DateRange;
  onRangeChange: (next: DateRange) => void;
  onBack: () => void;
}

function formatPeso(cents: number | null): string {
  return cents === null ? '—' : `₱${(cents / 100).toFixed(2)}`;
}

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}

export function AnalyticsDashboard({
  data,
  isLoading,
  error,
  range,
  onRangeChange,
  onBack,
}: AnalyticsDashboardProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader title="Analytics" onBack={onBack} />

      <TimeRangePicker range={range} onChange={onRangeChange} />

      <QueryStates
        isLoading={isLoading}
        error={error}
        isEmpty={!data}
        loadingLabel="Loading analytics…"
        errorLabel="Failed to load analytics"
        emptyLabel="No analytics for this range."
      >
        {data ? (
          <div className="flex flex-col gap-8">
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MetricCard label="Total orders" value={data.orderCount} />
              <MetricCard
                label="Average order value"
                value={formatPeso(data.averageOrderValueCents)}
              />
              <MetricCard
                label="Orders with deals"
                value={data.dealsSplit.withDeals.count}
                subLabel={`${data.dealsSplit.withoutDeals.count} without deals`}
              />
              <MetricCard
                label="Repeat purchase rate"
                value={formatRate(data.repeatPurchaseRate.rate)}
                subLabel={`${data.repeatPurchaseRate.numerator} of ${data.repeatPurchaseRate.denominator} customers`}
              />
              <MetricCard label="Stars earned" value={data.starsEarned} />
              <MetricCard label="Rewards unlocked" value={data.rewardsUnlocked} />
              <MetricCard label="Rewards redeemed" value={data.rewardsRedeemed} />
              <MetricCard
                label="New vs returning customers"
                value={`${data.newVsReturning.newCount} new`}
                subLabel={`${data.newVsReturning.returningCount} returning`}
              />
            </section>

            {data.branchScoped ? (
              <p className="text-xs text-muted-foreground">
                Stars &amp; rewards are program-wide (all branches).
              </p>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-h3 font-bold text-primary">Orders per branch</h2>
              <BranchOrdersTable rows={data.ordersPerBranch} />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-h3 font-bold text-primary">Top-selling products</h2>
              <TopProductsTable rows={data.topSellingProducts} />
            </section>
          </div>
        ) : null}
      </QueryStates>
    </main>
  );
}
