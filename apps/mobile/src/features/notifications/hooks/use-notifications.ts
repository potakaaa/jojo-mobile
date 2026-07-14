/**
 * `useNotifications()` — the local-state seam #75 (PUSH-004) swaps to a real data
 * source without touching screens. Backed by `useState` seeded from
 * `MOCK_NOTIFICATIONS` (newest-first). All rules delegate to the pure `lib`
 * functions; this is a thin React wrapper. `NotificationsProvider` + `useContext`
 * (mirrors `BranchProvider`/`CartSessionProvider`) so all consumers (Notifications
 * screen, Home header bell) share one state — `markRead`/opt-in changes in one
 * place are immediately visible in the other, no stale unread badge.
 */
import type { AppNotification } from '@jojopotato/types';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

const NotificationsContext = createContext<UseNotifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo<UseNotifications>(
    () => ({ notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn }),
    [notifications, unreadCount, markRead, marketingOptIn],
  );

  return createElement(NotificationsContext.Provider, { value }, children);
}

export function useNotifications(): UseNotifications {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}
