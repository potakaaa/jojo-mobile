import { DataTable, type DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

import { REWARD_TYPE_OPTIONS, type AdminReward } from '../lib/admin-rewards-api';

/**
 * Rewards table (ADM-005) — a consumer of the shared `DataTable` composite.
 * Presentational only (the parent route supplies query data + state). Rewards have
 * no validity window and no branch scope, so the status is a simple active/inactive
 * chip. "Edit" opens the create/edit dialog; "Deactivate"/"Activate" toggles the
 * soft-delete flag (with a confirmation on deactivate, handled by the parent).
 */
interface RewardListProps {
  rewards: AdminReward[] | undefined;
  isLoading: boolean;
  error: unknown;
  onEdit: (reward: AdminReward) => void;
  onToggleActive: (reward: AdminReward) => void;
}

function rewardTypeLabel(type: AdminReward['rewardType']): string {
  return REWARD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/**
 * Reward value display is polymorphic: `fixed_discount` shows pesos (÷100),
 * `percentage_discount` shows a percent (the cents value ÷100 IS the percent), and
 * the two product-benefit mechanics carry no scalar value.
 */
function valueDisplay(reward: AdminReward): string {
  if (reward.rewardValue === null) return '—';
  if (reward.rewardType === 'percentage_discount') return `${reward.rewardValue / 100}%`;
  if (reward.rewardType === 'fixed_discount') return `₱${(reward.rewardValue / 100).toFixed(2)}`;
  return '—';
}

export function RewardList({ rewards, isLoading, error, onEdit, onToggleActive }: RewardListProps) {
  const columns: DataTableColumn<AdminReward>[] = [
    { key: 'name', header: 'Name', cell: (r) => r.name },
    {
      key: 'stars',
      header: 'Required stars',
      cell: (r) => r.requiredStars,
      className: 'font-mono text-xs',
    },
    { key: 'type', header: 'Mechanic', cell: (r) => rewardTypeLabel(r.rewardType) },
    {
      key: 'value',
      header: 'Value',
      cell: (r) => valueDisplay(r),
      className: 'font-mono text-xs',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <StatusBadge tone={r.isActive ? 'success' : 'muted'}>
          {r.isActive ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (r) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onEdit(r)}>
            Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onToggleActive(r)}>
            {r.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rewards}
      rowKey={(r) => r.id}
      rowClassName={(r) => (r.isActive ? '' : 'opacity-50')}
      isLoading={isLoading}
      error={error}
      loadingLabel="Loading rewards…"
      errorLabel="Failed to load rewards"
      emptyLabel="No rewards yet. Create the first one."
    />
  );
}
