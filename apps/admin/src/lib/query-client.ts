import { QueryClient } from '@tanstack/react-query';

/**
 * apps/admin's own TanStack Query client — a SEPARATE instance from
 * apps/mobile's (different app/runtime/bundler). No queries wired yet; Phase 1+
 * add the real /api/admin data layer. `refetchOnWindowFocus` keeps back-office
 * data fresh when an admin tabs back into the dashboard.
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
