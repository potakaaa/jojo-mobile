import type { StaffProduct } from '@jojopotato/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchStaffProducts } from '../lib/staff-api';

/**
 * Query hook for the branch-scoped product list (STAFF-004).
 *
 * staleTime: 30s — product availability changes infrequently, so we avoid
 * redundant refetches while the staff member is navigating the screen.
 */
export function useStaffProducts(): UseQueryResult<StaffProduct[], Error> {
  return useQuery({
    queryKey: ['staff', 'products'],
    queryFn: fetchStaffProducts,
    staleTime: 30_000,
  });
}
