import type { StaffMe } from '@jojopotato/types';
import { useEffect, useState } from 'react';

import { fetchStaffMe } from '../lib/staff-api';

export interface UseStaffMeResult {
  data: StaffMe | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * One-shot fetch of `GET /api/staff/me` on mount (STAFF-001 shell). No library,
 * no refetch, no polling — the shell only needs the branch name once. Any
 * failure surfaces as a non-null `error` string so the shell shows a graceful
 * "Branch unavailable" fallback rather than a blank/incorrect value.
 */
export function useStaffMe(): UseStaffMeResult {
  const [data, setData] = useState<StaffMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return { data, isLoading, error };
}
