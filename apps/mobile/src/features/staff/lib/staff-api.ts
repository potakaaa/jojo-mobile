import type { StaffMe } from '@jojopotato/types';

import { authClient } from '@/features/auth/lib/auth-client';

/**
 * Fetch the current staff member's role + assigned branch from the canary
 * `GET /api/staff/me` endpoint (STAFF-001). This is the ONLY network call the
 * staff shell makes.
 *
 * Uses `authClient.$fetch` so the existing better-auth session (persisted in
 * SecureStore) is attached automatically — no manual header wiring, no
 * data-fetching library. Returns `null` on ANY failure so the shell can show a
 * graceful fallback instead of crashing; it never throws.
 */
export async function fetchStaffMe(): Promise<StaffMe | null> {
  try {
    const result = await authClient.$fetch('/api/staff/me');
    // better-fetch returns `{ data, error }`; a non-null `error` is a failed call.
    const { data, error } = result as { data: StaffMe | null; error: unknown };
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
