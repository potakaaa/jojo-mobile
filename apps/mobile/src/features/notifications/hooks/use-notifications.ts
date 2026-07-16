/**
 * `useNotifications()` — real data source (PUSH-004 / #75). Backed by a
 * react-query fetch of `GET /notifications` (session-scoped, newest-first
 * server-side) plus a `PATCH /notifications/:id/read` mutation. The marketing
 * opt-in is read/written through `useAuth()` (session `marketingOptIn` field via
 * `authClient.updateUser`), not local state — so the flag is server-owned and
 * survives restarts. `NotificationsProvider` + `useContext` (mirrors
 * `BranchProvider`/`CartSessionProvider`) so all consumers (Notifications screen,
 * Home header bell) share one state.
 *
 * The external hook shape is byte-identical to the prior mock version:
 * `{ notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn }`.
 */
import type { AppNotification } from '@jojopotato/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import type { SignInResult } from '@/features/auth/hooks/use-auth';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { apiRequest } from '@/features/shared/lib/api-request';

// Re-exported from the pure factory module so runtime consumers keep importing it
// from here, while the node-env test suite imports it from the pure module (this
// hook module transitively loads the auth/native graph and can't run under node).
export { DEFAULT_MARKETING_OPT_IN } from '@/features/notifications/lib/notification-factory';

const notificationsQueryKey = (userId: string | undefined) => ['notifications', userId] as const;
const EMPTY_NOTIFICATIONS: AppNotification[] = [];

async function fetchNotifications(): Promise<AppNotification[]> {
  const { notifications } = await apiRequest<{ notifications: AppNotification[] }>(
    '/notifications',
  );
  return notifications;
}

async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export interface UseNotifications {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  marketingOptIn: boolean;
  setMarketingOptIn: (value: boolean) => Promise<SignInResult>;
}

const NotificationsContext = createContext<UseNotifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, marketingOptIn, setMarketingOptIn: persistMarketingOptIn } = useAuth();

  const { data } = useQuery({
    queryKey: notificationsQueryKey(user?.id),
    queryFn: fetchNotifications,
    // Only fetch when signed in; the server route is session-gated.
    enabled: Boolean(user),
    refetchOnWindowFocus: true,
  });
  // Server returns rows newest-first already; no client re-sort needed. A stable
  // module-level empty-array fallback (not a fresh `[]` literal) keeps `notifications`
  // reference-stable across renders while `data` is undefined.
  const notifications = data ?? EMPTY_NOTIFICATIONS;

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey(user?.id) }),
  });

  const markRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation],
  );

  // Returns the persist promise (rather than fire-and-forget) so the caller can
  // await it and surface a failure — an opt-out that silently fails must not
  // look like it succeeded.
  const setMarketingOptIn = useCallback(
    (value: boolean) => persistMarketingOptIn(value),
    [persistMarketingOptIn],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.readAt == null).length,
    [notifications],
  );

  const value = useMemo<UseNotifications>(
    () => ({ notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn }),
    [notifications, unreadCount, markRead, marketingOptIn, setMarketingOptIn],
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
