/**
 * `useNotifications()` — the local-state seam #75 (PUSH-004) swaps to a real data
 * source without touching screens. Backed by `useState` seeded from
 * `MOCK_NOTIFICATIONS` (newest-first). All rules delegate to the pure `lib`
 * functions; this is a thin React wrapper. Plain hook, no provider — each
 * consumer (Notifications screen, Home header bell) gets its own local copy,
 * so `markRead` in one does not update the other until next mount (acceptable
 * for a mock-data seam; a shared provider is #75's concern if real-time sync
 * across screens is needed).
 */
import type { AppNotification } from '@jojopotato/types';
import { useCallback, useMemo, useState } from 'react';

import { sortNewestFirst } from '@/features/notifications/lib/notification-factory';
import { MOCK_NOTIFICATIONS } from '@/features/notifications/mock-notifications';

/**
 * Documented default: marketing opt-in is ON, so a fresh session shows the
 * seeded marketing items. Turning it OFF only stops NEW marketing being built
 * (A3) — it never removes items already in the list.
 */
export const DEFAULT_MARKETING_OPT_IN = true;

export interface UseNotifications {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  marketingOptIn: boolean;
  setMarketingOptIn: (value: boolean) => void;
}

export function useNotifications(): UseNotifications {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    sortNewestFirst(MOCK_NOTIFICATIONS),
  );
  const [marketingOptIn, setMarketingOptIn] = useState(DEFAULT_MARKETING_OPT_IN);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id && n.readAt == null ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.readAt == null).length,
    [notifications],
  );

  return { notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn };
}
