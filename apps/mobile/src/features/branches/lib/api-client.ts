import type { PickupBranch } from '@jojopotato/types';

import { apiRequest } from '@/features/shared/lib/api-request';

/** `GET /branches` — active pickup branches. */
export function fetchBranches(): Promise<PickupBranch[]> {
  return apiRequest<PickupBranch[]>('/branches');
}

/** `GET /branches/:branchId` — single branch detail (404 if missing/inactive). */
export function fetchBranch(branchId: string): Promise<PickupBranch> {
  return apiRequest<PickupBranch>(`/branches/${encodeURIComponent(branchId)}`);
}
