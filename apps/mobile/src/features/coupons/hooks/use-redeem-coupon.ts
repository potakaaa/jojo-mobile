import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { redeemCoupon, type ApiCouponWithLabel } from '@/lib/api-client';

/**
 * Redeem (use) a coupon (`POST /coupons/:id/redeem`). Atomic compare-and-swap
 * server-side; a re-redeem of an already-used/expired coupon throws an `ApiError`
 * with status 409, which the wallet screen surfaces as a friendly inline message.
 * On success the wallet is invalidated so the coupon flips to "used".
 */
export function useRedeemCoupon(): UseMutationResult<ApiCouponWithLabel, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (couponId: string) => redeemCoupon(couponId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
  });
}
