import type { PaymentMethod } from '@jojopotato/types';
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * In-memory payment-method selection seam. Order PLACEMENT no longer lives here
 * — checkout places orders against the real `POST /orders` endpoint via
 * `useCheckout()` (`features/orders`). This seam now holds only the currently
 * selected payment method so the payment-method screen and the checkout summary
 * stay in sync across navigation, defaulting to `pay_at_branch`.
 */
export interface OrderSessionState {
  /** Currently selected payment method (defaults to `pay_at_branch`). */
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
}

const OrderContext = createContext<OrderSessionState | null>(null);

export function OrderSessionProvider({ children }: { children: ReactNode }) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_at_branch');

  const value = useMemo<OrderSessionState>(
    () => ({ paymentMethod, setPaymentMethod }),
    [paymentMethod],
  );

  return createElement(OrderContext.Provider, { value }, children);
}

export function useOrder(): OrderSessionState {
  const ctx = useContext(OrderContext);
  if (!ctx) {
    throw new Error('useOrder must be used within an OrderSessionProvider');
  }
  return ctx;
}
