import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Button } from '@/components/ui/button';

import type { AdminCustomerSummary } from '../lib/admin-customers-api';

/**
 * Customer table (ADM-010) — a consumer of the shared `DataTable` composite plus a
 * controlled search input. READ-ONLY: "View" navigates to the detail page; there
 * is no edit/delete action (SPEC "Out Of Scope"). Presentational — the parent
 * route owns the search + query state (search value flows in via `search`, the
 * debounce + `useAdminCustomers` fetch live in the route).
 */
interface CustomerListProps {
  customers: AdminCustomerSummary[] | undefined;
  isLoading: boolean;
  error: unknown;
  search: string;
  onSearchChange: (value: string) => void;
  onView: (customer: AdminCustomerSummary) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function CustomerList({
  customers,
  isLoading,
  error,
  search,
  onSearchChange,
  onView,
}: CustomerListProps) {
  const columns: DataTableColumn<AdminCustomerSummary>[] = [
    { key: 'name', header: 'Name', cell: (c) => c.name },
    { key: 'email', header: 'Email', cell: (c) => c.email, className: 'text-xs' },
    {
      key: 'phone',
      header: 'Phone',
      cell: (c) => c.phoneNumber ?? '—',
      className: 'font-mono text-xs',
    },
    { key: 'joined', header: 'Joined', cell: (c) => formatDate(c.createdAt) },
    {
      key: 'actions',
      header: 'Actions',
      cell: (c) => (
        <Button size="sm" variant="secondary" onClick={() => onView(c)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by name, email, or phone…"
        aria-label="Search customers"
        className="h-9 w-full max-w-md rounded-md border-2 border-border bg-background px-3 text-sm text-foreground"
      />

      <DataTable
        columns={columns}
        rows={customers}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        error={error}
        loadingLabel="Loading customers…"
        errorLabel="Failed to load customers"
        emptyLabel="No customers match this search."
      />
    </div>
  );
}
