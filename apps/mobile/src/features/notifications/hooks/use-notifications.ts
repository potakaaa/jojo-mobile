/**
 * `useNotifications()` — real data source (PUSH-004 / #75; paginated +
 * deletable by notif-delete-pagination). Backed by a react-query
 * `useInfiniteQuery` of `GET /notifications` (session-scoped, newest-first,
 * cursor-paginated on `created_at`, 10 per page) plus `PATCH /:id/read`,
 * `PATCH /read-all`, and `DELETE /:id` mutations. The marketing opt-in is
 * read/written through `useAuth()` (session `marketingOptIn` field via
 * `authClient.updateUser`), not local state — so the flag is server-owned and
 * survives restarts. `NotificationsProvider` + `useContext` (mirrors
 * `BranchProvider`/`CartSessionProvider`) so all consumers (Notifications screen,
 * Home header bell) share one state.
 *
 * The external hook shape stays additive-compatible: `notifications` remains a
 * FLAT array (`data.pages.flatMap`) and `unreadCount` a top-level number
 * (`data.pages[0].unreadCount`, server-computed — never page-derived), so the
 * Home-header bell needs no edit. New capabilities (`deleteNotification`,
 * `hasNextPage`, `fetchNextPage`, `isFetchingNextPage`) are additive only.
 */
import type { AppNotification } from '@jojopotato/types';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
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

/** One page of the caller's notifications (newest-first) + the independent unread total. */
interface NotificationsPage {
  notifications: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

type NotificationsData = InfiniteData<NotificationsPage>;

async function fetchNotificationsPage({
  cursor,
}: {
  cursor: string | null;
}): Promise<NotificationsPage> {
  return apiRequest<NotificationsPage>(
    `/notifications?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
}

async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/notifications/read-all', { method: 'PATCH' });
}

async function deleteNotificationRequest(id: string): Promise<void> {
  await apiRequest(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface UseNotifications {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  refetch: () => void;
  isRefetching: boolean;
  /** True only until the FIRST page resolves — mirrors `useOrderHistory()`'s
   * `isPending`, so the screen can avoid flashing an empty state before any
   * data has arrived. */
  isPending: boolean;
  marketingOptIn: boolean;
  setMarketingOptIn: (value: boolean) => Promise<SignInResult>;
}

const NotificationsContext = createContext<UseNotifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, marketingOptIn, setMarketingOptIn: persistMarketingOptIn } = useAuth();
  const userId = user?.id;

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, refetch, isRefetching, isPending } =
    useInfiniteQuery({
      queryKey: notificationsQueryKey(userId),
      queryFn: ({ pageParam }) => fetchNotificationsPage({ cursor: pageParam }),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // Only fetch when signed in; the server route is session-gated.
      enabled: Boolean(user),
      refetchOnWindowFocus: true,
    });

  // Flatten the loaded pages into the flat array consumers expect. Memoized on
  // `data` so the reference stays stable across renders while pages are unchanged
  // (a fresh `flatMap` each render would otherwise re-trigger downstream memos).
  const notifications = useMemo(
    () => data?.pages.flatMap((p) => p.notifications) ?? EMPTY_NOTIFICATIONS,
    [data],
  );
  // Server-authoritative unread total (independent COUNT, same on every page) —
  // read from page 1 so the bell badge is correct regardless of scroll position.
  const unreadCount = data?.pages[0]?.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) }),
  });

  const markRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation],
  );

  const markAllRead = useCallback(async () => {
    const key = notificationsQueryKey(userId);
    const now = new Date().toISOString();
    // Optimistic update on the InfiniteData page-shape: stamp every unread row
    // with `now` and zero each page's unread total so the UI + badge clear instantly.
    queryClient.setQueryData<NotificationsData>(key, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p) => ({
          ...p,
          notifications: p.notifications.map((n) => (n.readAt == null ? { ...n, readAt: now } : n)),
          unreadCount: 0,
        })),
      };
    });
    try {
      await markAllNotificationsRead();
    } catch {
      // Revert on failure by invalidating so the server state is restored.
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient, userId]);

  const deleteMutation = useMutation({
    mutationFn: deleteNotificationRequest,
    onMutate: async (id: string) => {
      const key = notificationsQueryKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationsData>(key);
      queryClient.setQueryData<NotificationsData>(key, (old) => {
        if (!old) return old;
        // Was the removed row unread? (scan the loaded pages). If so, drop the
        // unread total by 1 on every page — the count is the same server total on
        // each page, and the badge reads page 1, so keeping them aligned matters.
        const removed = old.pages.flatMap((p) => p.notifications).find((n) => n.id === id);
        const wasUnread = removed != null && removed.readAt == null;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            notifications: p.notifications.filter((n) => n.id !== id),
            unreadCount: wasUnread ? Math.max(0, p.unreadCount - 1) : p.unreadCount,
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(notificationsQueryKey(userId), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
    },
  });

  const deleteNotification = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  // Returns the persist promise (rather than fire-and-forget) so the caller can
  // await it and surface a failure — an opt-out that silently fails must not
  // look like it succeeded.
  const setMarketingOptIn = useCallback(
    (value: boolean) => persistMarketingOptIn(value),
    [persistMarketingOptIn],
  );

  const value = useMemo<UseNotifications>(
    () => ({
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      deleteNotification,
      hasNextPage: Boolean(hasNextPage),
      fetchNextPage,
      isFetchingNextPage,
      refetch,
      isRefetching,
      isPending,
      marketingOptIn,
      setMarketingOptIn,
    }),
    [
      notifications,
      unreadCount,
      markRead,
      markAllRead,
      deleteNotification,
      hasNextPage,
      fetchNextPage,
      isFetchingNextPage,
      refetch,
      isRefetching,
      isPending,
      marketingOptIn,
      setMarketingOptIn,
    ],
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
