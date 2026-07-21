import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { AnalyticsDashboard } from '@/features/analytics/components/analytics-dashboard';
import {
  computePresetRange,
  type DateRange,
} from '@/features/analytics/components/time-range-picker';
import { useAnalytics } from '@/features/analytics/hooks/use-analytics';

export const Route = createFileRoute('/(dashboard)/analytics')({
  component: AnalyticsPage,
});

/**
 * Analytics screen (ADM-007) — READ-ONLY aggregation dashboard. Single screen, no
 * detail child, so no `<Outlet/>` layout split is needed (contrast the Phase
 * 3/6 list→detail routes). Owns the range state (defaulting to the last 7 days)
 * and feeds it to `useAnalytics`; the presentational `AnalyticsDashboard` renders
 * the cards + tables. Inherits the `(dashboard)` admin guard.
 */
function AnalyticsPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<DateRange>(() => computePresetRange('7d'));
  const query = useAnalytics(range);

  return (
    <AnalyticsDashboard
      data={query.data}
      isLoading={query.isLoading}
      error={query.error}
      range={range}
      onRangeChange={setRange}
      onBack={() => void navigate({ to: '/' })}
    />
  );
}
