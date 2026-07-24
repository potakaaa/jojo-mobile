import { fireEvent, render } from '@testing-library/react-native';

import { StarRatingInput } from '../star-rating-input';

// Ionicons loads its glyph font via an async effect; the glyph is incidental to
// the interaction contract (tap → onChange), so stub the icon to a synchronous
// no-op to keep renders deterministic.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

/**
 * AC10 — the star input is interactive: tapping star N sets value N by calling
 * `onChange(N)`. Asserts the real tap→callback behavior (not merely that a prop
 * was passed), so a broken handler that always fires `onChange(1)` would go red.
 * `findByTestId` is used for presence so each async render settles before its
 * assertions, keeping the suite order-independent under React 19 concurrent render.
 */
describe('StarRatingInput (AC10)', () => {
  test('renders `max` star controls (default 5)', async () => {
    const { findByTestId } = await render(
      <StarRatingInput value={0} onChange={jest.fn()} mode="light" testID="stars" />,
    );
    for (let n = 1; n <= 5; n += 1) {
      expect(await findByTestId(`stars-star-${n}`)).toBeTruthy();
    }
  });

  test('tapping star N calls onChange with N', async () => {
    const onChange = jest.fn();
    const { findByTestId } = await render(
      <StarRatingInput value={0} onChange={onChange} mode="light" testID="stars" />,
    );

    fireEvent.press(await findByTestId('stars-star-4'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);

    fireEvent.press(await findByTestId('stars-star-1'));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  test('respects a custom `max`', async () => {
    const { findByTestId, queryByTestId } = await render(
      <StarRatingInput value={2} onChange={jest.fn()} max={3} mode="dark" testID="stars" />,
    );
    expect(await findByTestId('stars-star-3')).toBeTruthy();
    expect(queryByTestId('stars-star-4')).toBeNull();
  });
});
