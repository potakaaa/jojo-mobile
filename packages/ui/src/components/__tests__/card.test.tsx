import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Card } from '../card';
import { Colors, type ThemeMode } from '../../theme';

/**
 * Render a Card and flatten its own host View style to a plain object, so we can
 * assert the RESOLVED colors rather than merely that a `mode` prop was passed.
 * A prop-presence assertion would go green on the pre-fix buggy code.
 */
async function renderCardStyle(mode: ThemeMode): Promise<Record<string, unknown>> {
  const { toJSON } = await render(
    <Card mode={mode}>
      <Text>Content</Text>
    </Card>,
  );
  const json = toJSON();

  if (!json || Array.isArray(json)) {
    throw new Error('Card should render exactly one host element');
  }

  return (StyleSheet.flatten(json.props.style) ?? {}) as Record<string, unknown>;
}

test('renders Card without throwing', async () => {
  await render(
    <Card mode="light">
      <Text>Content</Text>
    </Card>,
  );
});

test('mode="light" resolves the light surface and border tokens', async () => {
  const flat = await renderCardStyle('light');
  expect(flat.backgroundColor).toBe(Colors.light.backgroundElement);
  expect(flat.borderColor).toBe(Colors.light.border);
});

test('mode="dark" resolves the dark surface and border tokens', async () => {
  const flat = await renderCardStyle('dark');
  expect(flat.backgroundColor).toBe(Colors.dark.backgroundElement);
  expect(flat.borderColor).toBe(Colors.dark.border);
});

// The bug class this whole audit exists to kill: a Card that silently renders the
// light surface in dark mode. If `mode` ever stops driving the token read, the two
// modes collapse to the same color and this fails.
test('the mode prop actually drives the token read (light and dark differ)', async () => {
  const light = await renderCardStyle('light');
  const dark = await renderCardStyle('dark');
  expect(light.backgroundColor).not.toBe(dark.backgroundColor);
  expect(light.borderColor).not.toBe(dark.borderColor);
});
