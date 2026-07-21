import { Ionicons } from '@expo/vector-icons';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

import { Colors, Palette, type ThemeMode } from '../../theme';
import { Toast, TOAST_AUTO_DISMISS_MS, type ToastSeverity } from '../toast';

async function setup(over: Partial<ComponentProps<typeof Toast>> = {}) {
  const onDismiss = jest.fn();
  const utils = await render(
    <Toast
      visible
      message="Added to cart"
      severity="success"
      mode="light"
      bottomOffset={100}
      onDismiss={onDismiss}
      {...over}
    />,
  );
  return { ...utils, onDismiss };
}

/**
 * Flatten a rendered element's style to a plain object so we assert the RESOLVED
 * colors, not merely that a `mode`/`severity` prop was passed. The prior
 * dark-mode audit found `button.test.tsx` passing green with 3 tsc errors
 * precisely because it asserted prop presence over resolved output.
 */
function flattenStyle(element: { props: { style?: unknown } }): Record<string, unknown> {
  return (StyleSheet.flatten(element.props.style) ?? {}) as Record<string, unknown>;
}

const ALL_SEVERITIES: ToastSeverity[] = ['success', 'warning', 'error'];
const ALL_MODES: ThemeMode[] = ['light', 'dark'];

/**
 * The severity→accent decision, pinned independently of the component's own
 * private map. Importing that map would make this tautological (asserting the
 * map equals itself); re-stating it here means a swapped mapping actually fails.
 */
const EXPECTED_ACCENT: Record<ToastSeverity, string> = {
  success: Palette.green,
  warning: Palette.jorange,
  error: Palette.jred,
};

const EXPECTED_ICON: Record<ToastSeverity, string> = {
  success: 'checkmark-circle',
  warning: 'warning-outline',
  error: 'alert-circle',
};

test('renders the message', async () => {
  const { getByText } = await setup({ message: 'Deal removed — no longer eligible' });
  expect(getByText('Deal removed — no longer eligible')).toBeTruthy();
});

test('renders nothing when not visible', async () => {
  const { queryByText } = await setup({ visible: false });
  expect(queryByText('Added to cart')).toBeNull();
});

test('tapping the toast calls onDismiss', async () => {
  const { getByTestId, onDismiss } = await setup({ severity: 'error' });
  await fireEvent.press(getByTestId('toast-card'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

/* ------------------------------------------------------------------ *
 * AC2 — resolved styling across the full 3 severities x 2 modes matrix
 * ------------------------------------------------------------------ */

describe.each(ALL_SEVERITIES)('severity=%s', (severity) => {
  test.each(ALL_MODES)('mode=%s resolves the right accent and surface', async (mode) => {
    const { getByTestId } = await setup({ severity, mode });

    // Severity drives the accent chip.
    expect(flattenStyle(getByTestId('toast-icon-chip')).backgroundColor).toBe(
      EXPECTED_ACCENT[severity],
    );
    // Mode drives the card surface + border.
    expect(flattenStyle(getByTestId('toast-card')).backgroundColor).toBe(
      Colors[mode].backgroundElement,
    );
    expect(flattenStyle(getByTestId('toast-card')).borderColor).toBe(Colors[mode].border);
    // Mode drives the message color.
    expect(flattenStyle(getByTestId('toast-message')).color).toBe(Colors[mode].text);
  });
});

// The bug class the dark-mode audit exists to kill: if `mode` ever stops driving
// the token read, both modes collapse to one color and this fails.
test('the mode prop actually drives the token read (light and dark differ)', async () => {
  const light = await setup({ mode: 'light' });
  const dark = await setup({ mode: 'dark' });
  expect(flattenStyle(light.getByTestId('toast-card')).backgroundColor).not.toBe(
    flattenStyle(dark.getByTestId('toast-card')).backgroundColor,
  );
  expect(flattenStyle(light.getByTestId('toast-message')).color).not.toBe(
    flattenStyle(dark.getByTestId('toast-message')).color,
  );
});

// Likewise for severity: three severities must resolve three distinct accents,
// or the user cannot tell a success from a failure at a glance.
//
// Rendered SEQUENTIALLY on purpose. Rendering these concurrently (Promise.all)
// interleaves this RTL version's async act() scopes — React reports "overlapping
// act() calls" and the corrupted act queue then breaks unrelated later tests.
test('the severity prop actually drives the accent (all three differ)', async () => {
  const resolved: unknown[] = [];
  for (const severity of ALL_SEVERITIES) {
    const { getByTestId, unmount } = await setup({ severity });
    resolved.push(flattenStyle(getByTestId('toast-icon-chip')).backgroundColor);
    await unmount();
  }
  expect(new Set(resolved).size).toBe(ALL_SEVERITIES.length);
});

/**
 * Ionicons renders its glyph as the CHARACTER content of a Text node — it does
 * not forward a `name` prop — so assert each severity resolves a distinct glyph
 * character. Paired with the glyphmap test below, that pins both "the names are
 * real" and "each severity gets its own icon".
 */
test('each severity renders its own distinct Ionicons glyph', async () => {
  const glyphs: unknown[] = [];
  for (const severity of ALL_SEVERITIES) {
    const { getByTestId, unmount } = await setup({ severity });
    glyphs.push(getByTestId('toast-icon').props.children);
    await unmount();
  }
  expect(new Set(glyphs).size).toBe(ALL_SEVERITIES.length);
});

/**
 * Pins the glyph NAMES against the installed Ionicons glyphmap. The plan's first
 * draft specified `alert-triangle`, which does not exist in this pinned version —
 * a nonexistent glyph renders as blank/tofu rather than throwing, so nothing else
 * in this suite would catch the regression.
 */
test('every mapped icon name exists in the installed Ionicons glyphmap', () => {
  for (const name of Object.values(EXPECTED_ICON)) {
    expect(Ionicons.glyphMap).toHaveProperty(name);
  }
  expect(Ionicons.glyphMap).not.toHaveProperty('alert-triangle');
});

/* ------------------------------------------------------------------ *
 * AC3 — no RN Modal
 * ------------------------------------------------------------------ */

/** Collect every host element type name in a rendered tree. */
function collectTypes(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectTypes(child, out);
    return out;
  }
  const el = node as { type?: unknown; children?: unknown };
  if (typeof el.type === 'string') out.push(el.type);
  collectTypes(el.children, out);
  return out;
}

/**
 * AC3, checked at the RENDER level rather than by grepping the source file.
 *
 * `packages/ui`'s tsconfig deliberately pins `types: ["jest", "react"]`, so node's
 * `fs` is unavailable here and a source-read check would mean widening those types
 * for the whole package. This assertion is also the stronger one: it proves no
 * `Modal` reaches the rendered tree at all — including transitively through a
 * child — which a single-file import grep cannot do. Paired with the
 * renders/renders-nothing toggle tests above, it covers the failure mode
 * `confirm-dialog.tsx` documents: RN `Modal` not rendering its children in the
 * jest-expo tree after a visibility toggle.
 */
test('renders no react-native Modal anywhere in its tree', async () => {
  const { toJSON } = await setup();
  expect(collectTypes(toJSON())).not.toContain('Modal');
});

/* ------------------------------------------------------------------ *
 * Severity-driven auto-dismiss — the core safety behavior
 * ------------------------------------------------------------------ */

describe('auto-dismiss timer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('success auto-dismisses after TOAST_AUTO_DISMISS_MS', async () => {
    const { onDismiss } = await setup({ severity: 'success' });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // A failure the user never acknowledged must not disappear on its own — that
  // is exactly the guarantee raw Alert.alert() gave for free.
  test.each(['warning', 'error'] as const)(
    '%s never auto-dismisses, however long we wait',
    async (severity) => {
      const { onDismiss } = await setup({ severity });
      await act(async () => {
        jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 100);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    },
  );

  test('unmounting mid-countdown clears the timer (no dismiss after unmount)', async () => {
    const { onDismiss, unmount } = await setup({ severity: 'success' });
    await unmount();
    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // Replacing one success toast with another must restart the countdown. If the
  // effect did not depend on `message`, the new message would inherit the old
  // one's already-running clock and vanish early.
  test('replacing the message restarts the countdown rather than inheriting the old clock', async () => {
    const onDismiss = jest.fn();
    const { rerender } = await render(
      <Toast
        visible
        message="first"
        severity="success"
        mode="light"
        bottomOffset={100}
        onDismiss={onDismiss}
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 500);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await rerender(
      <Toast
        visible
        message="second"
        severity="success"
        mode="light"
        bottomOffset={100}
        onDismiss={onDismiss}
      />,
    );

    // The old clock would have fired by now; the restarted one must not have.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
