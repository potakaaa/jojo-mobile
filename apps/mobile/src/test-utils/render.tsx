import { jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Shared render helper for `apps/mobile` RN component tests. Three empirically
 * required fixes (proven during the phase-4 inner PVL probe) live here so screens
 * never re-derive them:
 *
 * 1. `SafeAreaProvider` is wrapped with an EXPLICIT fixed `initialMetrics`. The
 *    library's own `initialWindowMetrics` export is `null` under jest (no real
 *    layout pass fires) and silently renders an EMPTY tree — any screen using
 *    `useSafeAreaInsets` (every tab-root screen) would find zero elements.
 * 2. `renderWithProviders` is `async` and `await`s the underlying RTL `render()`:
 *    `@testing-library/react-native` returns a pending Promise (not a synchronous
 *    `RenderResult`) in `apps/mobile`'s dependency graph (expo-font Suspense).
 *    `await` handles both the promise and sync cases.
 * 3. A fresh `QueryClient` (retry off) per render so react-query hooks resolve
 *    deterministically without cross-test cache bleed.
 */

/** Fixed safe-area metrics — jest has no layout pass, so these must be explicit. */
export const TEST_SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export async function renderWithProviders(ui: ReactElement): Promise<RenderResult> {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>{children}</SafeAreaProvider>
    </QueryClientProvider>
  );
  return await render(ui, { wrapper: Wrapper });
}

/**
 * Spy on `Alert.alert` and return the spy so tests can assert a confirm dialog
 * fired and manually trigger its confirm button's `onPress`.
 */
export function spyOnAlert() {
  return jest.spyOn(Alert, 'alert');
}
