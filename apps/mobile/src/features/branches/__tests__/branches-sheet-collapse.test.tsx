import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { PickupBranch } from '@jojopotato/types';
import { act, fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';

import BranchLocatorScreen from '@/app/(tabs)/branches/index';
import { getBranches } from '@/lib/api-client';
import { renderWithProviders, requiredStyleValues } from '@/test-utils/render';

/**
 * Branches bottom sheet — snap geometry + tap-to-collapse (NATIVE path).
 *
 * The sibling `branches-screen` / `branches-refresh` suites both force the WEB
 * list-only path. This one is the opposite: it forces NATIVE so the sheet
 * branch renders, and stands in a scriptable fake for `@gorhom/bottom-sheet`
 * (the real one needs reanimated worklets + a layout pass that jest-expo has
 * no way to run).
 *
 * What the fake preserves — and why each part matters:
 *   - `handleComponent` is rendered INSIDE the sheet, exactly as gorhom's
 *     `BottomSheetHandleContainer` does, so the tap affordance is exercised
 *     where it really lives.
 *   - `snapToIndex` is a PURE spy. It deliberately does NOT echo back through
 *     `onChange`: a fake that both receives the command and simulates the
 *     settle would be asserting its own behaviour. Tests drive `onChange`
 *     explicitly instead, so "where the sheet is" is always stated by the test.
 *
 * What it cannot prove: the real gesture arbitration between the list, the
 * handle pan, and the sheet. That stays Agent-Probe (on-device) — these tests
 * lock the wiring and the geometry, not the native drag.
 */
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
});

/** Captures the props the screen hands to `<BottomSheet>` for assertion. */
const mockSheetProps: Record<string, unknown> = {};
const mockSnapToIndex = jest.fn<(index: number) => void>();

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { FlatList } = require('react-native');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Sheet = React.forwardRef(function Sheet(props: any, ref: any) {
    Object.assign(mockSheetProps, props);
    const { children, handleComponent: Handle } = props;
    React.useImperativeHandle(ref, () => ({ snapToIndex: mockSnapToIndex }));
    return React.createElement(React.Fragment, null, Handle ? Handle() : null, children);
  });

  return {
    __esModule: true,
    default: Sheet,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    BottomSheetFlatList: (props: any) =>
      React.createElement(FlatList, { testID: 'branches-sheet-list', ...props }),
  };
});

jest.mock('@/features/branches/components/branch-map', () => ({ BranchMap: () => null }));
jest.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ coords: null, status: 'denied' }),
}));
jest.mock('@/lib/api-client', () => ({ getBranches: jest.fn() }));

const mockGetBranches = jest.mocked(getBranches);

const ALWAYS_OPEN = JSON.stringify(
  Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
      day,
      { open: '00:00', close: '00:00' },
    ]),
  ),
);

function branch(over: Partial<PickupBranch> = {}): PickupBranch {
  return {
    id: 'b1',
    name: 'Test Branch',
    address: '123 Test St',
    latitude: 10,
    longitude: 123,
    phone: '000',
    openingHours: ALWAYS_OPEN,
    estimatedPrepMinutes: 15,
    isAcceptingPickup: true,
    priority: 0,
    isOpen: true,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockSheetProps)) delete mockSheetProps[key];
  mockGetBranches.mockResolvedValue([branch({ name: 'Open Cafe' })]);
});

/*
  NOTE ON FILE SIZE — keep the render count here low (~4).

  Each `renderWithProviders` of this screen is expensive under jest-expo, and
  past roughly five renders in a single file the tree stops settling: later
  renders come back without the sheet at all. Assertions are therefore grouped
  per render rather than split one-per-test. If you add cases, fold them into an
  existing render or start a new file — do not just append another render.
*/
describe('Branches bottom sheet — snap geometry', () => {
  test('opens at the 32% floor, has no smaller peek, and is never dismissable', async () => {
    const screen = await renderWithProviders(<BranchLocatorScreen />);
    expect(await screen.findByText('Open Cafe')).toBeTruthy();

    // '12%' was tried and reverted — it hid the sheet header behind the
    // floating tab bar. The floor must stay at '32%'.
    expect(mockSheetProps.snapPoints).toEqual(['32%', '50%', '92%']);

    const snapPoints = mockSheetProps.snapPoints as string[];
    // Assert the RESOLVED detent, not just the raw number — an index that
    // silently pointed somewhere else would still pass a bare `toBe(0)`.
    expect(snapPoints[mockSheetProps.index as number]).toBe('32%');
    // Absent (or false) => a downward drag bottoms out instead of dismissing.
    expect(mockSheetProps.enablePanDownToClose).toBeFalsy();
  });

  test('the sheet list wires no pull-to-refresh (it blocks collapse at the top snap)', async () => {
    const screen = await renderWithProviders(<BranchLocatorScreen />);
    expect(await screen.findByText('Open Cafe')).toBeTruthy();

    // gorhom sets `refreshable = onRefresh !== undefined`, and then refuses to
    // move the sheet on a CONTENT drag while refreshable at the highest snap.
    const list = screen.getByTestId('branches-sheet-list');
    expect(list.props.onRefresh).toBeUndefined();
    expect(list.props.refreshing).toBeUndefined();
  });
});

describe('Branches bottom sheet — tap-to-collapse handle', () => {
  /**
   * Render and wait for the handle to actually exist.
   *
   * The `findBy*` (not `getBy*`) matters: this screen suspends on `expo-font`,
   * and later renders within one file settle a tick after `render()` resolves.
   * A sync query there reads an unsettled tree and reports a missing handle.
   */
  async function renderSheet() {
    const screen = await renderWithProviders(<BranchLocatorScreen />);
    const handle = await screen.findByTestId('branches-sheet-handle');
    return { screen, handle };
  }

  /** Report a settle at `index`, the way the real sheet's `onChange` does. */
  async function settleAt(index: number) {
    await act(async () => {
      (mockSheetProps.onChange as (i: number) => void)(index);
    });
  }

  test('is an accessible ≥44dp button, disabled at the floor so a tap cannot dismiss', async () => {
    // The sheet opens at index 0 — the '32%' floor — so there is nothing to
    // collapse and the control must say so rather than silently no-op.
    const { handle } = await renderSheet();

    expect(handle.props.accessibilityRole).toBe('button');
    expect(handle.props.accessibilityLabel).toBe('Collapse branch list');
    expect(handle.props.accessibilityState).toEqual({ disabled: true });

    const { minHeight } = requiredStyleValues(handle, ['minHeight']);
    expect(minHeight).toBeGreaterThanOrEqual(44);

    fireEvent.press(handle);
    expect(mockSnapToIndex).not.toHaveBeenCalled();
  });

  test('a tap steps the sheet down exactly one snap point, from wherever it is', async () => {
    const { screen } = await renderSheet();

    // From the top snap (index 2): enabled, and one step down — NOT a jump
    // straight to the floor, which would swallow the whole sheet in one tap.
    await settleAt(2);
    expect(screen.getByTestId('branches-sheet-handle').props.accessibilityState).toEqual({
      disabled: false,
    });
    fireEvent.press(screen.getByTestId('branches-sheet-handle'));
    expect(mockSnapToIndex).toHaveBeenLastCalledWith(1);

    // From the middle snap → one more step, reaching the floor.
    await settleAt(1);
    fireEvent.press(screen.getByTestId('branches-sheet-handle'));
    expect(mockSnapToIndex).toHaveBeenLastCalledWith(0);

    expect(mockSnapToIndex).toHaveBeenCalledTimes(2);
  });
});
