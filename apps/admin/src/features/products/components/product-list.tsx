import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';

import type { AdminProduct } from '../lib/admin-products-api';

/**
 * Product table. Loading / error / empty states delegate to the shared
 * `QueryStates` composite (ADM-003, Decision 1). Inactive rows stay visible
 * (dimmed) with a "Reactivate" action. Price is rendered from cents as ₱.
 * `categoryName` resolves `categoryId` for display (looked up by the parent).
 */
interface ProductListProps {
  products: AdminProduct[] | undefined;
  isLoading: boolean;
  error: unknown;
  categoryName: (categoryId: string) => string;
  onManage: (product: AdminProduct) => void;
  onEdit: (product: AdminProduct) => void;
  onDeactivate: (product: AdminProduct) => void;
  onReactivate: (product: AdminProduct) => void;
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

export function ProductList({
  products,
  isLoading,
  error,
  categoryName,
  onManage,
  onEdit,
  onDeactivate,
  onReactivate,
}: ProductListProps) {
  return (
    <QueryStates
      isLoading={isLoading}
      error={error}
      isEmpty={!products || products.length === 0}
      loadingLabel="Loading products…"
      errorLabel="Failed to load products"
      emptyLabel="No products yet. Create the first one."
    >
      <div className="overflow-x-auto rounded-xl border-2 border-foreground">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b-2 border-foreground bg-secondary/40">
            <tr>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Category</th>
              <th className="px-4 py-2 font-semibold">Price</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products?.map((product) => (
              <tr
                key={product.id}
                className={`border-b border-foreground/20 ${product.isActive ? '' : 'opacity-50'}`}
              >
                <td className="px-4 py-2">{product.name}</td>
                <td className="px-4 py-2">{categoryName(product.categoryId)}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {formatPeso(product.basePriceCents)}
                </td>
                <td className="px-4 py-2">{product.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => onManage(product)}>
                      Manage
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onEdit(product)}>
                      Edit
                    </Button>
                    {product.isActive ? (
                      <Button size="sm" variant="destructive" onClick={() => onDeactivate(product)}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => onReactivate(product)}>
                        Reactivate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </QueryStates>
  );
}
