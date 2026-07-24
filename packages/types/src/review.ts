/**
 * Order review domain types (order-completion-celebration).
 *
 * A `Review` is one customer rating (1–5) + optional comment per completed order,
 * created via `POST /orders/:orderId/review`. Structurally mirrors the API
 * boundary `ApiReview` (`packages/api/src/routes/lib/serializers.ts`) — the
 * mobile client reads the response as `Review`, so field-name/optionality drift
 * between the two silently breaks the client.
 */

/** A submitted order review, as returned by the API (camelCase, ISO createdAt). */
export interface Review {
  id: string;
  orderId: string;
  userId: string;
  /** Overall order rating, 1–5. */
  rating: number;
  /** Optional short free-text comment; null for a rating-only review. */
  comment: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

/** Request body for `POST /orders/:orderId/review`. */
export interface SubmitReviewRequest {
  /** Overall order rating, 1–5. */
  rating: number;
  /** Optional short free-text comment. */
  comment?: string;
}

/** Response envelope for `POST /orders/:orderId/review`. */
export interface SubmitReviewResponse {
  review: Review;
}
