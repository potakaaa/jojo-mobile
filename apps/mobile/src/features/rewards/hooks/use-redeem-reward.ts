import type { Coupon } from '@jojopotato/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { redeemReward } from '@/lib/api-client';

/**
 * Redeem a reward (`POST /rewards/:id/redeem`). The server decrements stars and
 * issues a coupon atomically — no optimistic star-decrement here (STAFF-003
 * precedent: never move UI ahead of a server-authoritative mutation). On success
 * the star balance, catalog, and coupon wallet are all invalidated so the new
 * balance and freshly-issued coupon appear without a restart.
 */
export function useRedeemReward(): UseMutationResult<Coupon, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) => redeemReward(rewardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rewards', 'balance'] });
      void queryClient.invalidateQueries({ queryKey: ['rewards', 'catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}
