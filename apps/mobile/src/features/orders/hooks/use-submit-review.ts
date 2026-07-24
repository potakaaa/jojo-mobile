import type { Review, SubmitReviewRequest } from '@jojopotato/types';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { submitReview } from '@/features/orders/lib/api-client';

/**
 * Mutation hook for submitting an order review
 * (`POST /orders/:orderId/review`, order-completion-celebration).
 *
 * Write-only from the client's view — the tracking screen does not display
 * persisted review state, so there is nothing to invalidate here (D8: no edit
 * after submit; the prompt closes to a submitted acknowledgement). Errors arrive
 * as a plain `Error` from `apiRequest`; the overlay surfaces `error.message`.
 */
export function useSubmitReview(
  orderId: string,
): UseMutationResult<Review, Error, SubmitReviewRequest> {
  return useMutation({
    mutationFn: (body: SubmitReviewRequest) => submitReview(orderId, body),
  });
}
