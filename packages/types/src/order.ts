import type { Cart } from './cart';

export type OrderStatus =
  'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  userId: string; // mock multi-user scoping (D6)
  cart: Cart; // historical snapshot (name/price/options at order time)
  branchId: string; // HIST-001 "Branch"; also drives single-branch reorder check
  status: OrderStatus;
  totalCents: number;
  starsEarned: number; // flat mock value (D5); 0 for cancelled orders
  placedAt: string; // ISO 8601; explicit sort key, newest-first
  createdAt: string; // retained for back-compat; NOT the sort key going forward
}
