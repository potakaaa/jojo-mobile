import type { Flavor } from '@jojopotato/types';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '../../theme';
import { FlavorSelector } from '../flavor-selector';
import { MOCK_FLAVOR } from './mocks';

/**
 * A1 / AC1-AC3: an option row shows price text ONLY when its delta is non-zero.
 * A zero (or absent) delta renders no trailing price text at all — no "+₱0.00",
 * no "Included", nothing. Positive deltas carry a leading "+"; negative deltas
 * must be visually distinguishable from positive (different sign AND colour).
 *
 * These assert the RESOLVED style output, not merely that a `mode`/delta prop was
 * passed — a prop-presence assertion would go green on the pre-fix code.
 */

const MIXED_FLAVORS: Flavor[] = [
  { id: 'f-zero', name: 'Sea Salt', priceDeltaCents: 0 },
  { id: 'f-absent', name: 'Plain' },
  { id: 'f-pos', name: 'Cheese', priceDeltaCents: 1200 },
];

/** Flatten a rendered node's RN `style` prop down to its resolved `color`. */
function colorOf(node: { props: { style?: unknown } }): unknown {
  return ((StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>).color;
}

test('renders FlavorSelector without throwing', async () => {
  await render(
    <FlavorSelector mode="light" flavors={[MOCK_FLAVOR]} selectedFlavorId={MOCK_FLAVOR.id} />,
  );
});

test('renders no price text for a zero-delta or absent-delta flavor', async () => {
  const { queryByText } = await render(<FlavorSelector mode="light" flavors={MIXED_FLAVORS} />);

  // Names still render.
  expect(queryByText('Sea Salt')).not.toBeNull();
  expect(queryByText('Plain')).not.toBeNull();

  // No zero-value price text of any shape.
  expect(queryByText(/₱0\.00/)).toBeNull();
  expect(queryByText(/Included/i)).toBeNull();
  expect(queryByText('+₱0.00')).toBeNull();
});

test('renders a leading "+" price for a positive-delta flavor', async () => {
  const { getByText } = await render(<FlavorSelector mode="light" flavors={MIXED_FLAVORS} />);

  expect(getByText('+₱12.00')).toBeTruthy();
});

test('exactly one price text node renders for a 3-row mixed fixture', async () => {
  const { queryAllByText } = await render(<FlavorSelector mode="light" flavors={MIXED_FLAVORS} />);

  // Only the single non-zero row contributes price text.
  expect(queryAllByText(/₱/)).toHaveLength(1);
});

test('renders a negative delta visually distinct from a positive delta (AC3)', async () => {
  const { getByText } = await render(
    <FlavorSelector
      mode="light"
      flavors={[
        { id: 'f-pos', name: 'Cheese', priceDeltaCents: 1200 },
        { id: 'f-neg', name: 'Discounted', priceDeltaCents: -1200 },
      ]}
    />,
  );

  const positive = getByText('+₱12.00');
  const negative = getByText('-₱12.00');

  // Sign differs: the negative row never renders a "+".
  expect(String(negative.props.children)).not.toContain('+');

  // Colour differs too: negative uses the accent token, positive does not.
  expect(colorOf(negative)).toBe(Colors.light.accent);
  expect(colorOf(positive)).not.toBe(Colors.light.accent);
});

test('negative delta stays accent-coloured even when the chip is selected', async () => {
  const { getByText } = await render(
    <FlavorSelector
      mode="light"
      flavors={[{ id: 'f-neg', name: 'Discounted', priceDeltaCents: -1200 }]}
      selectedFlavorId="f-neg"
    />,
  );

  expect(colorOf(getByText('-₱12.00'))).toBe(Colors.light.accent);
});

test('single-select rows announce the radio role inside a radiogroup', async () => {
  const { getAllByRole, toJSON } = await render(
    <FlavorSelector mode="light" flavors={MIXED_FLAVORS} />,
  );

  // Pick-one semantics: radio rows, not buttons.
  expect(getAllByRole('radio')).toHaveLength(3);
  // The container announces the grouping. Asserted off the rendered root because
  // a non-`accessible` View is not reachable via a byRole query.
  expect((toJSON() as { props: Record<string, unknown> }).props.accessibilityRole).toBe(
    'radiogroup',
  );
});

test('accessibilityState.checked tracks the selected flavor only', async () => {
  const { getAllByRole } = await render(
    <FlavorSelector mode="light" flavors={MIXED_FLAVORS} selectedFlavorId="f-absent" />,
  );

  expect(getAllByRole('radio').map((r) => r.props.accessibilityState.checked)).toEqual([
    false,
    true,
    false,
  ]);
});

test('tapping a row calls onSelect with that flavor', async () => {
  const onSelect = jest.fn();
  const { getByText } = await render(
    <FlavorSelector mode="light" flavors={MIXED_FLAVORS} onSelect={onSelect} />,
  );

  fireEvent.press(getByText('Cheese'));

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(MIXED_FLAVORS[2]);
});

test('the mode prop actually drives the price-delta token read (light and dark differ)', async () => {
  const flavors: Flavor[] = [{ id: 'f-pos', name: 'Cheese', priceDeltaCents: 1200 }];

  const light = await render(<FlavorSelector mode="light" flavors={flavors} />);
  expect(colorOf(light.getByText('+₱12.00'))).toBe(Colors.light.textSecondary);

  const dark = await render(<FlavorSelector mode="dark" flavors={flavors} />);
  expect(colorOf(dark.getByText('+₱12.00'))).toBe(Colors.dark.textSecondary);

  expect(Colors.light.textSecondary).not.toBe(Colors.dark.textSecondary);
});
