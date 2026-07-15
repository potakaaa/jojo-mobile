import type { StaffBranchSettings } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchStaffBranchSettings } from '../lib/staff-api';

/**
 * Query hook for the branch's operational settings (STAFF-004).
 *
 * staleTime: 0 — pickup acceptance status is safety-critical; always fetch
 * fresh data so staff never operates on a stale pickup-enabled state.
 */
export function useStaffBranchSettings(): UseQueryResult<StaffBranchSettings, Error> {
  return useQuery({
    queryKey: ['staff', 'branch'],
    queryFn: fetchStaffBranchSettings,
    staleTime: 0,
  });
}
