import { env } from '@/config/env';

/**
 * The FIRST fetch wrapper in `apps/admin` (no prior `admin-api.ts` to reuse,
 * unlike mobile's `staff-api.ts`). Talks to the ADM-002 `/api/admin/branches`
 * surface. `credentials: 'include'` sends the HttpOnly session cookie on the
 * cross-origin request (admin dev port → API port), matching `auth-client.ts`'s
 * convention — the server's `requireAdmin` guard reads that cookie.
 */

/** Admin-facing branch shape — mirrors the server's `AdminBranch` (serializers.ts). */
export interface AdminBranch {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  openingHours: string;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  isActive: boolean;
}

export interface BranchCreateInput {
  name: string;
  slug: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  openingHours: string;
  isAcceptingPickup?: boolean;
  estimatedPrepMinutes?: number;
}

export type BranchUpdateInput = Partial<BranchCreateInput> & { isActive?: boolean };

/** Carries the HTTP status alongside the server's error message (e.g. 409 slug). */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

const BASE = `${env.apiUrl}/api/admin/branches`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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

export function listBranches(): Promise<AdminBranch[]> {
  return request<{ branches: AdminBranch[] }>('').then((r) => r.branches);
}

export function getBranch(id: string): Promise<AdminBranch> {
  return request<{ branch: AdminBranch }>(`/${id}`).then((r) => r.branch);
}

export function createBranch(input: BranchCreateInput): Promise<AdminBranch> {
  return request<{ branch: AdminBranch }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.branch);
}

export function updateBranch(id: string, input: BranchUpdateInput): Promise<AdminBranch> {
  return request<{ branch: AdminBranch }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.branch);
}

export function deactivateBranch(id: string): Promise<AdminBranch> {
  return request<{ branch: AdminBranch }>(`/${id}/deactivate`, {
    method: 'PATCH',
  }).then((r) => r.branch);
}
