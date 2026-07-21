import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Skeleton } from '../skeleton';
import { Colors, Radii, type ThemeMode } from '../../theme';

/**
 * Render a Skeleton and flatten its single host View style so we can assert the
 * RESOLVED fill rather than merely that a `mode` prop was passed — a prop-presence
 * assertion would go green even if `mode` stopped driving the token read.
 */
async function renderSkeletonStyle(
  mode: ThemeMode,
  props: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { toJSON } = await render(<Skeleton mode={mode} {...props} />);
  const json = toJSON();

  if (!json || Array.isArray(json)) {
    throw new Error('Skeleton should render exactly one host element');
  }

  return (StyleSheet.flatten(json.props.style) ?? {}) as Record<string, unknown>;
}

test('renders Skeleton without throwing', async () => {
  await render(<Skeleton mode="light" />);
});

test('mode="light" resolves the light surface token', async () => {
  const flat = await renderSkeletonStyle('light');
  expect(flat.backgroundColor).toBe(Colors.light.backgroundElement);
});

test('mode="dark" resolves the dark surface token', async () => {
  const flat = await renderSkeletonStyle('dark');
  expect(flat.backgroundColor).toBe(Colors.dark.backgroundElement);
});

// The mutation guard: if `mode` ever stops driving the token read, the two modes
// collapse to the same fill and this fails.
test('resolves a different fill color for mode=dark vs mode=light', async () => {
  const light = await renderSkeletonStyle('light');
  const dark = await renderSkeletonStyle('dark');
  expect(light.backgroundColor).not.toBe(dark.backgroundColor);
});

test('applies width/height/radius props to the resolved style', async () => {
  const flat = await renderSkeletonStyle('light', { width: 120, height: 40, radius: Radii.sm });
  expect(flat.width).toBe(120);
  expect(flat.height).toBe(40);
  expect(flat.borderRadius).toBe(Radii.sm);
});
