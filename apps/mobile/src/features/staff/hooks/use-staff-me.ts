import type { StaffMe } from '@jojopotato/types';
import { useCallback, useEffect, useState } from 'react';

import { fetchStaffMe } from '../lib/staff-api';

export interface UseStaffMeResult {
  data: StaffMe | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Re-run the one-shot fetch on demand. Added for the staff dashboard
   * pull-to-refresh so a pull updates the branch name too (e.g. after an admin
   * reassigns the staff member's branch mid-session), alongside the polled
   * order/settings queries.
   */
  refetch: () => Promise<void>;
}

/**
 * One-shot fetch of `GET /api/staff/me` on mount (STAFF-001 shell). No polling —
 * the shell only needs the branch name, which rarely changes; a `refetch` is
 * exposed for the dashboard pull-to-refresh. Any failure surfaces as a non-null
 * `error` string so the shell shows a graceful "Branch unavailable" fallback
 * rather than a blank/incorrect value.
 */
export function useStaffMe(): UseStaffMeResult {
  const [data, setData] = useState<StaffMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const result = await fetchStaffMe();
    if (result) {
      setData(result);
      setError(null);
    } else {
      setError('Could not load branch info');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchStaffMe().then((result) => {
      if (!active) return;
      if (result) {
        setData(result);
        setError(null);
      } else {
        setError('Could not load branch info');
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { data, isLoading, error, refetch };
}
