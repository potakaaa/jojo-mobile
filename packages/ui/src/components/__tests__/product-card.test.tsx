import { Ionicons } from '@expo/vector-icons';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ProductCard } from '../product-card';
import { Colors } from '../../theme';
import { MOCK_PRODUCT } from './mocks';

/** The glyph character Ionicons renders for the `chevron-forward` icon. */
const CHEVRON_GLYPH = String.fromCodePoint(Number(Ionicons.glyphMap['chevron-forward']));

test('renders ProductCard without throwing', () => {
  render(<ProductCard mode="light" product={MOCK_PRODUCT} />);
});

// AC8: the footer affordance is a neutral view/open glyph (a chevron), not an
// ambiguous "+" add-to-cart-looking label. Query the affordance node by its
// testID handle and assert it renders an Ionicons chevron (not a "+" Text).
test('renders a view/chevron affordance node (not a "+" add label)', async () => {
  const { getByTestId, getByText, queryByText } = await render(
    <ProductCard mode="light" product={MOCK_PRODUCT} />,
  );

  // The affordance wrapper is present and queryable via its testID handle.
  expect(getByTestId('product-card-affordance')).toBeTruthy();
  // It renders the resolved chevron-forward glyph, proving a view/open affordance
  // rather than an "add" control. Tying the assertion to the glyphMap lookup makes
  // it fail if the icon name ever diverges from what actually renders.
  expect(getByText(CHEVRON_GLYPH)).toBeTruthy();
  // The old ambiguous "+" glyph must be gone.
  expect(queryByText('+')).toBeNull();
});

// AC8: tapping the card fires ONLY the passed onPress — there is no separate
// add-to-cart handler on ProductCard, so nothing else can fire.
test('tapping the card fires only the passed onPress', async () => {
  const onPress = jest.fn();
  const { getByRole } = await render(
    <ProductCard mode="light" product={MOCK_PRODUCT} onPress={onPress} />,
  );

  fireEvent.press(getByRole('button'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

// home-all-branches AC2/AC3 (render half) — the branch caption row.
test('renders the subtext caption verbatim when provided', async () => {
  const { getByTestId } = await render(
    <ProductCard mode="light" product={MOCK_PRODUCT} subtext="Available at 3 branches" />,
  );

  // Verbatim: the card must NOT prefix or reformat the caller's sentence.
  expect(getByTestId('product-card-subtext').props.children).toBe('Available at 3 branches');
});

test('omits the subtext row entirely when not provided', async () => {
  const { queryByTestId } = await render(<ProductCard mode="light" product={MOCK_PRODUCT} />);

  expect(queryByTestId('product-card-subtext')).toBeNull();
});

test('renders the subtext in dark mode with the dark secondary-text colour', async () => {
  const light = await render(
    <ProductCard mode="light" product={MOCK_PRODUCT} subtext="Downtown" />,
  );
  const lightColour = StyleSheet.flatten(light.getByTestId('product-card-subtext').props.style)
    .color as string;

  const dark = await render(<ProductCard mode="dark" product={MOCK_PRODUCT} subtext="Downtown" />);
  const darkColour = StyleSheet.flatten(dark.getByTestId('product-card-subtext').props.style)
    .color as string;

  // Asserting the RESOLVED colours differ (not merely that a `mode` prop was
  // passed) is what makes this a real dark-mode check rather than a vacuous one.
  expect(lightColour).toBe(Colors.light.textSecondary);
  expect(darkColour).toBe(Colors.dark.textSecondary);
  expect(lightColour).not.toBe(darkColour);
});
