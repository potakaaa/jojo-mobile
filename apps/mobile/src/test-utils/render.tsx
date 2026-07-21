import { jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Alert, StyleSheet } from 'react-native';
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

/**
 * Resolve the RESOLVED bottom offset of a rendered `<Toast>`, given its
 * `toast-card` node. The offset lives on the card's parent overlay
 * (`[styles.overlay, { bottom: bottomOffset }]`).
 *
 * Reads the flattened style rather than the prop so AC7's clearance assertions
 * check what actually painted, not merely that a number was passed down.
 */
export function toastOverlayBottom(toastCard: { parent: { props: { style?: unknown } } | null }) {
  const overlay = toastCard.parent;
  if (!overlay) throw new Error('toast-card has no parent overlay');
  const flat = (StyleSheet.flatten(overlay.props.style) ?? {}) as Record<string, unknown>;
  return flat.bottom;
}

/**
 * Flatten a rendered node's `style` prop to the values that ACTUALLY painted,
 * after every conditional override in its style array has been applied.
 *
 * This is the only honest way to pin a screen's computed clearance against a
 * sticky bar's real geometry under jest: `jest-expo` runs no layout pass, so a
 * node's true pixel height is unmeasurable (`onLayout` never fires with real
 * numbers). Reading the flattened style is the closest available proxy — and it
 * is the one that matters, because the clearance bug it guards came from exactly
 * this gap: a `paddingBottom` override winning over a StyleSheet default, while
 * a constant derived from that (now-dead) default silently under-reported.
 */
export function flattenNodeStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
}

/**
 * Read the given numeric style keys off a rendered node, THROWING if any is
 * missing or non-numeric.
 *
 * The throw is the point. These values feed clearance arithmetic, and a silently
 * absent key would coerce to `undefined` → `NaN` → a comparison that quietly
 * passes, which is precisely the class of vacuous test this guards. If a render
 * site stops emitting `paddingBottom`, the test must fail loudly rather than
 * assert against garbage.
 */
export function requiredStyleValues<K extends string>(
  node: { props: { style?: unknown } },
  keys: readonly K[],
): Record<K, number> {
  const flat = flattenNodeStyle(node);
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const value = flat[key];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(
        `expected a numeric \`${key}\` in the rendered style, got ${JSON.stringify(value)}`,
      );
    }
    out[key] = value;
  }
  return out;
}
