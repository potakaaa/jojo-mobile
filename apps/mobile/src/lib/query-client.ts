import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client — scoped to menu/branch/product data only (per
 * SPEC Out Of Scope: not an app-wide data-fetching mandate). `refetchOnWindowFocus`
 * gives the mid-session freshness AC11 relies on; a short `staleTime` keeps menu
 * data reasonably live without hammering the API.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
  },
});
