import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createReward,
  getReward,
  listRewards,
  updateReward,
  type RewardCreateInput,
  type RewardUpdateInput,
} from '../lib/admin-rewards-api';

/**
 * react-query hooks over the ADM-005 rewards API. Mirrors `use-admin-offers.ts` —
 * every mutation invalidates the list (and, for updates, the detail) query on
 * success so the UI reflects the change without a manual refetch.
 */
export const REWARDS_KEY = ['admin', 'rewards'] as const;

export function useAdminRewards() {
  return useQuery({ queryKey: REWARDS_KEY, queryFn: listRewards });
}

export function useAdminReward(id: string) {
  return useQuery({
    queryKey: [...REWARDS_KEY, id],
    queryFn: () => getReward(id),
    enabled: id.length > 0,
  });
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RewardCreateInput) => createReward(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: REWARDS_KEY }),
  });
}

export function useUpdateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RewardUpdateInput }) =>
      updateReward(id, input),
    onSuccess: (reward) => {
      void qc.invalidateQueries({ queryKey: REWARDS_KEY });
      void qc.invalidateQueries({ queryKey: [...REWARDS_KEY, reward.id] });
    },
  });
}
