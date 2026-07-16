import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button } from '../button';
import { MinTouchTarget } from '../../theme';

/** Resolve a Pressable host node's style (function or array) to a flat object. */
function flattenPressableStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const style = node.props.style;
  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  return (StyleSheet.flatten(resolved as never) ?? {}) as Record<string, unknown>;
}

test('renders Button without throwing', async () => {
  await render(<Button label="Order now" onPress={() => {}} />);
});

test('md Button meets the 48px minimum touch-target floor (incl. border)', async () => {
  const { getByRole } = await render(<Button label="Order now" onPress={() => {}} />);
  const flat = flattenPressableStyle(getByRole('button'));
  expect(flat.minHeight).toBe(MinTouchTarget);
  expect(flat.minHeight as number).toBeGreaterThanOrEqual(48);
});

test('sm Button meets the 48px minimum touch-target floor (incl. border)', async () => {
  const { getByRole } = await render(<Button label="Change" size="sm" onPress={() => {}} />);
  const flat = flattenPressableStyle(getByRole('button'));
  expect(flat.minHeight).toBe(MinTouchTarget);
  expect(flat.minHeight as number).toBeGreaterThanOrEqual(48);
});
