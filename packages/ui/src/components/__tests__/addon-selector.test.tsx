import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '../../theme';
import { AddOnSelector, type AddOnOption } from '../addon-selector';

/**
 * A1 / AC1-AC3 for `AddOnSelector` — no test file existed for this component
 * before this batch. Same zero-hidden / positive-"+" / negative-distinct rule as
 * the flavor and size selectors, driven by `AddOnOption.priceDeltaCents`.
 */

const MIXED_OPTIONS: AddOnOption[] = [
  { id: 'ao-zero', name: 'Ketchup', priceDeltaCents: 0 },
  { id: 'ao-absent', name: 'Napkins' },
  { id: 'ao-pos', name: 'Extra Cheese', priceDeltaCents: 1200 },
];

/** Flatten a rendered node's RN `style` prop down to its resolved `color`. */
function colorOf(node: { props: { style?: unknown } }): unknown {
  return ((StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>).color;
}

test('renders AddOnSelector without throwing', async () => {
  await render(<AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={[]} />);
});

test('renders no price text for a zero-delta or absent-delta add-on', async () => {
  const { queryByText } = await render(
    <AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={[]} />,
  );

  expect(queryByText('Ketchup')).not.toBeNull();
  expect(queryByText('Napkins')).not.toBeNull();

  expect(queryByText(/₱0\.00/)).toBeNull();
  expect(queryByText(/Included/i)).toBeNull();
  expect(queryByText('+₱0.00')).toBeNull();
});

test('renders a leading "+" price for a positive-delta add-on', async () => {
  const { getByText } = await render(
    <AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={[]} />,
  );

  expect(getByText('+₱12.00')).toBeTruthy();
});

test('exactly one price text node renders for a 3-row mixed fixture', async () => {
  const { queryAllByText } = await render(
    <AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={[]} />,
  );

  expect(queryAllByText(/₱/)).toHaveLength(1);
});

test('renders a negative delta visually distinct from a positive delta (AC3)', async () => {
  const { getByText } = await render(
    <AddOnSelector
      mode="light"
      selectedIds={[]}
      options={[
        { id: 'ao-pos', name: 'Extra Cheese', priceDeltaCents: 1200 },
        { id: 'ao-neg', name: 'No Sauce', priceDeltaCents: -1200 },
      ]}
    />,
  );

  const positive = getByText('+₱12.00');
  const negative = getByText('-₱12.00');

  expect(String(negative.props.children)).not.toContain('+');
  expect(colorOf(negative)).toBe(Colors.light.accent);
  expect(colorOf(positive)).not.toBe(Colors.light.accent);
});

test('multi-select rows announce the checkbox role, never radio/radiogroup', async () => {
  const { getAllByRole, queryAllByRole, toJSON } = await render(
    <AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={[]} />,
  );

  // These stack — checkbox semantics, and explicitly NOT the pick-one roles.
  expect(getAllByRole('checkbox')).toHaveLength(3);
  expect(queryAllByRole('radio')).toHaveLength(0);
  expect((toJSON() as { props: Record<string, unknown> }).props.accessibilityRole).toBeUndefined();
});

test('accessibilityState.checked tracks every selected add-on (multi-select)', async () => {
  const { getAllByRole } = await render(
    <AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={['ao-zero', 'ao-pos']} />,
  );

  expect(getAllByRole('checkbox').map((r) => r.props.accessibilityState.checked)).toEqual([
    true,
    false,
    true,
  ]);
});

test('tapping a row calls onToggle with that add-on id', async () => {
  const onToggle = jest.fn();
  const { getByText } = await render(
    <AddOnSelector mode="light" options={MIXED_OPTIONS} selectedIds={[]} onToggle={onToggle} />,
  );

  fireEvent.press(getByText('Extra Cheese'));

  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledWith('ao-pos');
});

test('the mode prop actually drives the price-delta token read (light and dark differ)', async () => {
  const options: AddOnOption[] = [{ id: 'ao-pos', name: 'Extra Cheese', priceDeltaCents: 1200 }];

  const light = await render(<AddOnSelector mode="light" options={options} selectedIds={[]} />);
  expect(colorOf(light.getByText('+₱12.00'))).toBe(Colors.light.textSecondary);

  const dark = await render(<AddOnSelector mode="dark" options={options} selectedIds={[]} />);
  expect(colorOf(dark.getByText('+₱12.00'))).toBe(Colors.dark.textSecondary);

  expect(Colors.light.textSecondary).not.toBe(Colors.dark.textSecondary);
});
