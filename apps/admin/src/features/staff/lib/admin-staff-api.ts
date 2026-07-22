import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-009 `/api/admin/staff` surface. Mirrors
 * `features/rewards/lib/admin-rewards-api.ts` (same `credentials: 'include'`
 * cookie convention, same status-carrying error). Owns the staff list + branch
 * assignment. Role changes reuse the EXISTING `POST /api/admin/users/:id/role`
 * route unmodified — see `postStaffRole` (base path `${API}` not `${API}/staff`).
 */

/** A staff-level admin user (mirrors the server's `AdminStaffSummary`, serializers.ts). */
export interface AdminStaffMember {
  id: string;
  name: string;
  email: string;
  role: 'staff' | 'admin' | 'super_admin';
  assignedBranchId: string | null;
  branchName: string | null;
}

/** The staff-level roles an add-staff target may be granted (ADM-011). */
export type StaffRole = 'staff' | 'admin' | 'super_admin';

/** Result of `GET /api/admin/users/lookup` (mirrors the server's `AdminUserLookupResult`). */
export interface AdminUserLookup {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'staff' | 'admin' | 'super_admin';
}

/** Body for `POST /api/admin/staff/invite` (ADM-011). */
export interface StaffInviteInput {
  email: string;
  intendedRole: StaffRole;
  intendedBranchId?: string | null;
}

/** Result of `POST /api/admin/staff/invite` (mirrors the server's `AdminStaffInviteSummary`). */
export interface StaffInviteSummary {
  email: string;
  intendedRole: StaffRole;
  intendedBranchId: string | null;
  expiresAt: string;
}

/** Carries the HTTP status alongside the server's error message. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

// Two distinct base paths, kept visually separate so the reused role route is
// never accidentally nested under `/staff`:
const STAFF_API = `${env.apiUrl}/api/admin/staff`;
const USERS_API = `${env.apiUrl}/api/admin/users`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the default message */
    }
    throw new AdminApiError(res.status, message);
  }

  return (await res.json()) as T;
}

/** GET /api/admin/staff — the full staff roster. */
export function listStaff(): Promise<AdminStaffMember[]> {
  return request<{ staff: AdminStaffMember[] }>(STAFF_API).then((r) => r.staff);
}

/** PATCH /api/admin/staff/:id/branch — set (uuid) or clear (null) a staff member's branch. */
export function patchStaffBranch(id: string, branchId: string | null): Promise<AdminStaffMember> {
  return request<{ staff: AdminStaffMember }>(`${STAFF_API}/${id}/branch`, {
    method: 'PATCH',
    body: JSON.stringify({ branchId }),
  }).then((r) => r.staff);
}

/**
 * POST /api/admin/users/:id/role — reuses the EXISTING (unmodified) role-change
 * route. super_admin-only on the server (the client gate is cosmetic). Returns the
 * updated `{ id, email, role }` slice.
 */
export function postStaffRole(
  id: string,
  role: 'customer' | 'staff' | 'admin' | 'super_admin',
): Promise<{ id: string; email: string; role: string }> {
  return request<{ resource: { id: string; email: string; role: string } }>(
    `${USERS_API}/${id}/role`,
    {
      method: 'POST',
      body: JSON.stringify({ role }),
    },
  ).then((r) => r.resource);
}

/**
 * GET /api/admin/users/lookup?email= (ADM-011) — exact-match lookup for the "+ Add
 * staff" promote path. Returns the user, or `null` when no account has that email
 * (a normal branch of the flow, not an error — the server returns 200 `{ user: null }`).
 */
export function lookupUserByEmail(email: string): Promise<AdminUserLookup | null> {
  return request<{ user: AdminUserLookup | null }>(
    `${USERS_API}/lookup?email=${encodeURIComponent(email)}`,
  ).then((r) => r.user);
}

/**
 * POST /api/admin/staff/invite (ADM-011) — create a single-use email invite for an
 * email with no account. The raw token is delivered only via email/log; the response
 * carries only email/role/branch/expiry.
 */
export function createStaffInvite(input: StaffInviteInput): Promise<StaffInviteSummary> {
  return request<{ invite: StaffInviteSummary }>(`${STAFF_API}/invite`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.invite);
}
