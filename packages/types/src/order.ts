import type { Cart } from './cart';

export type OrderStatus =
  'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  cart: Cart;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
}
