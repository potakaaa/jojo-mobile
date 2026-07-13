import type { Order } from '@jojopotato/types';
import { useCallback, useRef, useState } from 'react';

import { createOrder, type CreateOrderInput } from '@/features/orders/lib/api-client';

export interface UseCheckoutResult {
  /**
   * Place the order. Returns the created `Order` on success, or `null` on
   * failure (with `error` set). A ref-guard drops any call made while a
   * previous submission is still in flight, so a double-tap can never fire two
   * real orders even before React re-renders the disabled button.
   */
  placeOrder: (input: CreateOrderInput) => Promise<Order | null>;
  submitting: boolean;
  error: string | null;
}

export function useCheckout(): UseCheckoutResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const placeOrder = useCallback(async (input: CreateOrderInput): Promise<Order | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      return await createOrder(input);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not place your order. Please try again.');
      return null;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, []);

  return { placeOrder, submitting, error };
}
