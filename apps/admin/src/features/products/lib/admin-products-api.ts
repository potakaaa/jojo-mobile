import { env } from '@/config/env';

/**
 * Fetch wrapper for the ADM-003 `/api/admin/products` surface — products, their
 * options, and per-branch availability. Mirrors P2's `admin-branches-api.ts`
 * (`credentials: 'include'` for the HttpOnly session cookie). All money fields
 * are integer CENTS at the boundary, matching the server.
 */

export type OptionType = 'size' | 'flavor' | 'add_on';

export interface AdminProduct {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  isActive: boolean;
  isRewardEligible: boolean;
  /** True for deal-products (`products.is_deal`). Excluded from benefit pickers. */
  isDeal: boolean;
}

export interface AdminProductOption {
  id: string;
  productId: string;
  optionType: OptionType;
  name: string;
  priceDeltaCents: number;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminBranchAvailability {
  id: string;
  branchId: string;
  productId: string;
  isAvailable: boolean;
}

export interface ProductCreateInput {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  basePriceCents: number;
  isActive?: boolean;
  isRewardEligible?: boolean;
}

export type ProductUpdateInput = Partial<ProductCreateInput> & { isActive?: boolean };

export interface OptionCreateInput {
  optionType: OptionType;
  name: string;
  priceDeltaCents?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export type OptionUpdateInput = Partial<OptionCreateInput> & { isActive?: boolean };

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

const BASE = `${env.apiUrl}/api/admin/products`;

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

// ── Products ──
export function listProducts(categoryId?: string): Promise<AdminProduct[]> {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  return request<{ products: AdminProduct[] }>(query).then((r) => r.products);
}

export function getProduct(id: string): Promise<AdminProduct> {
  return request<{ product: AdminProduct }>(`/${id}`).then((r) => r.product);
}

export function createProduct(input: ProductCreateInput): Promise<AdminProduct> {
  return request<{ product: AdminProduct }>('', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.product);
}

export function updateProduct(id: string, input: ProductUpdateInput): Promise<AdminProduct> {
  return request<{ product: AdminProduct }>(`/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.product);
}

export function deactivateProduct(id: string): Promise<AdminProduct> {
  return request<{ product: AdminProduct }>(`/${id}/deactivate`, {
    method: 'PATCH',
  }).then((r) => r.product);
}

// ── Options ──
export function listOptions(productId: string): Promise<AdminProductOption[]> {
  return request<{ options: AdminProductOption[] }>(`/${productId}/options`).then((r) => r.options);
}

export function createOption(
  productId: string,
  input: OptionCreateInput,
): Promise<AdminProductOption> {
  return request<{ option: AdminProductOption }>(`/${productId}/options`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.option);
}

export function updateOption(
  productId: string,
  optionId: string,
  input: OptionUpdateInput,
): Promise<AdminProductOption> {
  return request<{ option: AdminProductOption }>(`/${productId}/options/${optionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.option);
}

export function deactivateOption(productId: string, optionId: string): Promise<AdminProductOption> {
  return request<{ option: AdminProductOption }>(`/${productId}/options/${optionId}/deactivate`, {
    method: 'PATCH',
  }).then((r) => r.option);
}

// ── Availability ──
export function listAvailability(productId: string): Promise<AdminBranchAvailability[]> {
  return request<{ availability: AdminBranchAvailability[] }>(`/${productId}/availability`).then(
    (r) => r.availability,
  );
}

export function setAvailability(
  productId: string,
  branchId: string,
  isAvailable: boolean,
): Promise<AdminBranchAvailability> {
  return request<{ availability: AdminBranchAvailability }>(
    `/${productId}/availability/${branchId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable }),
    },
  ).then((r) => r.availability);
}
