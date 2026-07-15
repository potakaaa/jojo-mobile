import { Button } from '@/components/ui/button';
import { QueryStates } from '@/components/query-states';

import type { AdminCategory } from '../lib/admin-categories-api';

/**
 * Category table. Loading / error / empty states are delegated to the shared
 * `QueryStates` composite (ADM-003, Decision 1) rather than hand-rolled inline.
 * Inactive (soft-deleted) rows stay visible (dimmed) with a "Reactivate" action,
 * since the admin view — unlike the public menu — must show deactivated rows.
 */
interface CategoryListProps {
  categories: AdminCategory[] | undefined;
  isLoading: boolean;
  error: unknown;
  onEdit: (category: AdminCategory) => void;
  onDeactivate: (category: AdminCategory) => void;
  onReactivate: (category: AdminCategory) => void;
}

export function CategoryList({
  categories,
  isLoading,
  error,
  onEdit,
  onDeactivate,
  onReactivate,
}: CategoryListProps) {
  return (
    <QueryStates
      isLoading={isLoading}
      error={error}
      isEmpty={!categories || categories.length === 0}
      loadingLabel="Loading categories…"
      errorLabel="Failed to load categories"
      emptyLabel="No categories yet. Create the first one."
    >
      <div className="overflow-x-auto rounded-xl border-2 border-foreground">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b-2 border-foreground bg-secondary/40">
            <tr>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Slug</th>
              <th className="px-4 py-2 font-semibold">Sort</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories?.map((category) => (
              <tr
                key={category.id}
                className={`border-b border-foreground/20 ${category.isActive ? '' : 'opacity-50'}`}
              >
                <td className="px-4 py-2">{category.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{category.slug}</td>
                <td className="px-4 py-2">{category.sortOrder}</td>
                <td className="px-4 py-2">{category.isActive ? 'Active' : 'Inactive'}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => onEdit(category)}>
                      Edit
                    </Button>
                    {category.isActive ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDeactivate(category)}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => onReactivate(category)}>
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
