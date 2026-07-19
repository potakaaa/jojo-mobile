import { useQuery } from '@tanstack/react-query';

import { analyticsQueryKey, getAnalytics, type AnalyticsParams } from '../lib/admin-analytics-api';

/**
 * react-query hook over the ADM-007 read-only analytics API. The key includes the
 * full param tuple (via `analyticsQueryKey`, which normalizes `branchId` per E4)
 * so a range or branch change re-fetches into a distinct cache entry (AC5's UI
 * half). Read-only — no mutations.
 */
export function useAnalytics(params: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsQueryKey(params),
    queryFn: () => getAnalytics(params),
  });
}
