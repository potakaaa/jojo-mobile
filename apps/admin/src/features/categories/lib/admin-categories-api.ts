import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-003 `/api/admin/categories` surface. Mirrors P2's
 * `admin-branches-api.ts` exactly — `credentials: 'include'` sends the HttpOnly
 * session cookie cross-origin so the server's `requireAdmin` guard reads it.
 */

/** Admin-facing category shape — mirrors the server's `AdminCategory`. */
export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryCreateInput {
  name: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type CategoryUpdateInput = Partial<CategoryCreateInput> & { isActive?: boolean };

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

const BASE = `${env.apiUrl}/api/admin/categories`;

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

export function listCategories(): Promise<AdminCategory[]> {
  return request<{ categories: AdminCategory[] }>('').then((r) => r.categories);
}

export function createCategory(input: CategoryCreateInput): Promise<AdminCategory> {
  return request<{ category: AdminCategory }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.category);
}

export function updateCategory(id: string, input: CategoryUpdateInput): Promise<AdminCategory> {
  return request<{ category: AdminCategory }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.category);
}

export function deactivateCategory(id: string): Promise<AdminCategory> {
  return request<{ category: AdminCategory }>(`/${id}/deactivate`, {
    method: 'PATCH',
  }).then((r) => r.category);
}
