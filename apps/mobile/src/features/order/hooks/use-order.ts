import type { Order, PaymentMethod, PlaceOrderRequest, PlaceOrderResult } from '@jojopotato/types';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useCart } from '@/features/cart/hooks/use-cart';
import { MOCK_BRANCH_PREP_MINUTES, MOCK_CART_BRANCH } from '@/features/cart/mock-cart';
import {
  buildOrderFromRequest,
  devFlags,
  generateOrderNumber,
  validatePlaceOrderRequest,
} from '@/features/order/mock-order';

/**
 * In-memory order-placement seam, composed alongside (not merged into) the cart
 * seam. It reads the current cart via `useCart()` to snapshot the order, and
 * calls `clearCart()` ONLY on success — every failure branch preserves the cart
 * (AC4/AC5/AC6). There is NO backend yet: `placeOrder` is contract-shaped to
 * mirror the eventual `POST /api/orders`; swapping to the real backend changes
 * only this file's internals, not `PlaceOrderRequest`/`PlaceOrderResult`/`Order`
 * (already backend-shaped) nor any screen consumer.
 */
export interface OrderSessionState {
  placeOrder: (paymentMethod: PaymentMethod) => Promise<PlaceOrderResult>;
  isPlacingOrder: boolean;
  lastOrder: Order | null;
  /** Currently selected payment method (defaults to `pay_at_branch`). */
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
}

/**
 * Dev-only availability controls (AC4/AC5/AC6). `__DEV__`-gated screen
 * affordances flip these to demonstrate the failure paths live without a real
 * backend. Not read in production behavior beyond the toggles themselves.
 */
export const orderDevControls = {
  /** When false, the next placeOrder returns branch_unavailable (AC4). */
  branchAvailable: true,
  /** Product ids treated as unavailable for the next placeOrder (AC5). */
  unavailableProductIds: [] as string[],
};

const OrderContext = createContext<OrderSessionState | null>(null);

export function OrderSessionProvider({ children }: { children: ReactNode }) {
  const { cart, discountTotalCents, clearCart } = useCart();
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_at_branch');

  const placeOrder = useCallback(
    async (paymentMethod: PaymentMethod): Promise<PlaceOrderResult> => {
      setIsPlacingOrder(true);
      try {
        // Simulate the async round-trip the real fetch()-backed version will have.
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (devFlags.simulateNetworkFailure) {
          return { ok: false, reason: 'network' };
        }

        const estimatedReadyAt = new Date(
          Date.now() + MOCK_BRANCH_PREP_MINUTES * 60_000,
        ).toISOString();

        const request: PlaceOrderRequest = {
          branchId: cart.pickupBranchId || MOCK_CART_BRANCH.id,
          items: cart.items.map((line) => ({
            menuItemId: line.menuItemId,
            productNameSnapshot: line.productNameSnapshot,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            selectedOptions: line.selectedOptions.map((opt) => ({
              optionType: opt.optionType,
              id: opt.id,
              name: opt.name,
              priceDeltaCents: opt.priceDeltaCents,
            })),
          })),
          discountTotalCents,
          paymentMethod,
        };

        const validation = validatePlaceOrderRequest(
          request,
          orderDevControls.branchAvailable,
          orderDevControls.unavailableProductIds,
        );
        if (!validation.ok) {
          return validation;
        }

        const order = buildOrderFromRequest(request, generateOrderNumber(), estimatedReadyAt);
        // Snapshot the placed order BEFORE resetting the selection so the
        // confirmation screen reads this order's method, not the reset default.
        setLastOrder(order);
        clearCart();
        setPaymentMethod('pay_at_branch');
        return { ok: true, order };
      } finally {
        setIsPlacingOrder(false);
      }
    },
    [cart, discountTotalCents, clearCart],
  );

  const value = useMemo<OrderSessionState>(
    () => ({ placeOrder, isPlacingOrder, lastOrder, paymentMethod, setPaymentMethod }),
    [placeOrder, isPlacingOrder, lastOrder, paymentMethod],
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
