import type { OrderStatus } from '@jojopotato/types';

import { Palette } from '@/constants/theme';

/**
 * Staff-facing status pill config (OC-6). Staff screens use their OWN status
 * labels — NOT `OrderStatusBadge` from `@jojopotato/ui`, which renders
 * customer-facing copy ("Preparing" vs the staff "Frying now" domain). Shared
 * between the Active Orders list and the Order Detail screen.
 *
 * Only the 5 non-terminal statuses appear on staff active-order surfaces;
 * terminal statuses (`completed`, `cancelled`) are filtered server-side.
 */
export const STAFF_STATUS_CONFIG: Record<
  Extract<OrderStatus, 'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready'>,
  { label: string; bg: string; text: string }
> = {
  pending: { label: 'Pending', bg: Palette.jorange, text: Palette.ink },
  accepted: { label: 'Accepted', bg: Palette.jyellow, text: Palette.ink },
  preparing: { label: 'Preparing', bg: Palette.jgold, text: Palette.ink },
  flavoring: { label: 'Flavoring', bg: Palette.jbrown, text: Palette.cream },
  ready: { label: 'Ready', bg: Palette.green, text: Palette.cream },
};

/** The non-terminal staff statuses, in workflow order. */
export type StaffOrderStatus = keyof typeof STAFF_STATUS_CONFIG;
