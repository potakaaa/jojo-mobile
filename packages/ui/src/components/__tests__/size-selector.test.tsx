import type { Size } from '@jojopotato/types';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '../../theme';
import { SizeSelector } from '../size-selector';
import { MOCK_SIZE } from './mocks';

/**
 * A1 / AC1-AC3 for `SizeSelector`. Sizes carry their delta on the pre-existing
 * `Size.priceModifierCents` field (no type change was needed here) — the same
 * zero-hidden / positive-"+" / negative-distinct rule must hold.
 */

const MIXED_SIZES: Size[] = [
  { id: 'sz-regular', label: 'Regular', priceModifierCents: 0 },
  { id: 'sz-absent', label: 'Standard' },
  { id: 'sz-large', label: 'Large', priceModifierCents: 1200 },
];

/** Flatten a rendered node's RN `style` prop down to its resolved `color`. */
function colorOf(node: { props: { style?: unknown } }): unknown {
  return ((StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>).color;
}

test('renders SizeSelector without throwing', async () => {
  await render(<SizeSelector mode="light" sizes={[MOCK_SIZE]} selectedSizeId={MOCK_SIZE.id} />);
});

test('renders no price text for a zero-modifier or absent-modifier size', async () => {
  const { queryByText } = await render(<SizeSelector mode="light" sizes={MIXED_SIZES} />);

  expect(queryByText('Regular')).not.toBeNull();
  expect(queryByText('Standard')).not.toBeNull();

  expect(queryByText(/₱0\.00/)).toBeNull();
  expect(queryByText(/Included/i)).toBeNull();
  expect(queryByText('+₱0.00')).toBeNull();
});

test('renders a leading "+" price for a positive-modifier size', async () => {
  const { getByText } = await render(<SizeSelector mode="light" sizes={MIXED_SIZES} />);

  expect(getByText('+₱12.00')).toBeTruthy();
});

test('exactly one price text node renders for a 3-row mixed fixture', async () => {
  const { queryAllByText } = await render(<SizeSelector mode="light" sizes={MIXED_SIZES} />);

  expect(queryAllByText(/₱/)).toHaveLength(1);
});

test('renders a negative modifier visually distinct from a positive one (AC3)', async () => {
  const { getByText } = await render(
    <SizeSelector
      mode="light"
      sizes={[
        { id: 'sz-large', label: 'Large', priceModifierCents: 1200 },
        { id: 'sz-mini', label: 'Mini', priceModifierCents: -1200 },
      ]}
    />,
  );

  const positive = getByText('+₱12.00');
  const negative = getByText('-₱12.00');

  expect(String(negative.props.children)).not.toContain('+');
  expect(colorOf(negative)).toBe(Colors.light.accent);
  expect(colorOf(positive)).not.toBe(Colors.light.accent);
});

test('single-select rows announce the radio role inside a radiogroup', async () => {
  const { getAllByRole, toJSON } = await render(<SizeSelector mode="light" sizes={MIXED_SIZES} />);

  // Pick-one semantics: radio rows, not buttons.
  expect(getAllByRole('radio')).toHaveLength(3);
  // The container announces the grouping. Asserted off the rendered root because
  // a non-`accessible` View is not reachable via a byRole query.
  expect((toJSON() as { props: Record<string, unknown> }).props.accessibilityRole).toBe(
    'radiogroup',
  );
});

test('accessibilityState.checked tracks the selected size only', async () => {
  const { getAllByRole } = await render(
    <SizeSelector mode="light" sizes={MIXED_SIZES} selectedSizeId="sz-large" />,
  );

  expect(getAllByRole('radio').map((r) => r.props.accessibilityState.checked)).toEqual([
    false,
    false,
    true,
  ]);
});

test('tapping a row calls onSelect with that size', async () => {
  const onSelect = jest.fn();
  const { getByText } = await render(
    <SizeSelector mode="light" sizes={MIXED_SIZES} onSelect={onSelect} />,
  );

  fireEvent.press(getByText('Large'));

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(MIXED_SIZES[2]);
});

test('the mode prop actually drives the price-delta token read (light and dark differ)', async () => {
  const sizes: Size[] = [{ id: 'sz-large', label: 'Large', priceModifierCents: 1200 }];

  const light = await render(<SizeSelector mode="light" sizes={sizes} />);
  expect(colorOf(light.getByText('+₱12.00'))).toBe(Colors.light.textSecondary);

  const dark = await render(<SizeSelector mode="dark" sizes={sizes} />);
  expect(colorOf(dark.getByText('+₱12.00'))).toBe(Colors.dark.textSecondary);

  expect(Colors.light.textSecondary).not.toBe(Colors.dark.textSecondary);
});
