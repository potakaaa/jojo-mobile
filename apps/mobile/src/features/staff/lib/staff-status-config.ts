import type { OrderStatus } from '@jojopotato/types';

import { Palette } from '@/constants/theme';

/**
 * Staff-facing status pill config (OC-6 + STAFF-003). Staff screens use their OWN
 * status labels — NOT `OrderStatusBadge` from `@jojopotato/ui`, which renders
 * customer-facing copy ("Preparing" vs the staff "Frying now" domain). Shared
 * between the Active Orders list, Order Detail screen, and Completed Orders screen.
 *
 * The 5 non-terminal statuses appear on staff active-order surfaces;
 * the 3 terminal statuses (completed, cancelled, rejected) appear on the
 * Completed Orders screen and on detail screens for historical orders.
 */
export const STAFF_STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; text: string }> =
  {
    // Non-terminal (active orders)
    pending: { label: 'Pending', bg: Palette.jorange, text: Palette.ink },
    accepted: { label: 'Accepted', bg: Palette.jyellow, text: Palette.ink },
    preparing: { label: 'Preparing', bg: Palette.jgold, text: Palette.ink },
    flavoring: { label: 'Flavoring', bg: Palette.jbrown, text: Palette.cream },
    ready: { label: 'Ready', bg: Palette.green, text: Palette.cream },
    // Terminal (completed orders)
    completed: { label: 'Completed', bg: Palette.greenDark, text: Palette.cream },
    cancelled: { label: 'Cancelled', bg: Palette.neutral500, text: Palette.cream },
    rejected: { label: 'Rejected', bg: Palette.jred, text: Palette.cream },
  };

/** All staff-displayable statuses (active + terminal). */
export type StaffOrderStatus = keyof typeof STAFF_STATUS_CONFIG;
