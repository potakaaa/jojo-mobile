import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { StarProgressBar } from '../star-progress-bar';
import { MOCK_PROGRESS } from './mocks';

/** Parse the numeric width percent of the progress-bar fill from its style. */
function fillPercent(fill: { props: Record<string, unknown> }): number {
  const flat = StyleSheet.flatten(fill.props.style as never) as { width?: string };
  return Number.parseInt(flat.width ?? '0%', 10);
}

test('renders StarProgressBar without throwing', async () => {
  await render(<StarProgressBar progress={MOCK_PROGRESS} />);
});

// AC1 — 3/5 renders a partial (60%) bar with a "stars to your reward" caption.
test('AC1: 3/5 progress renders a 60% bar and a stars-remaining caption', async () => {
  const { getByTestId, getByText } = await render(
    <StarProgressBar progress={{ currentStars: 3, requiredStars: 5 }} />,
  );
  expect(fillPercent(getByTestId('star-progress-fill'))).toBe(60);
  expect(getByText('2 stars to your reward')).toBeTruthy();
});

// AC1 — 3/5 (60%) is distinct from 5/5 (100%).
test('AC1: 3/5 fill width is distinct from 5/5 fill width', async () => {
  const partial = await render(
    <StarProgressBar progress={{ currentStars: 3, requiredStars: 5 }} />,
  );
  const partialPct = fillPercent(partial.getByTestId('star-progress-fill'));
  const full = await render(<StarProgressBar progress={{ currentStars: 5, requiredStars: 5 }} />);
  const fullPct = fillPercent(full.getByTestId('star-progress-fill'));
  expect(partialPct).not.toBe(fullPct);
});

// AC2 — reaching the threshold flips to a full bar + "Reward unlocked" caption.
test('AC2: 5/5 progress renders a 100% bar and an unlocked caption', async () => {
  const { getByTestId, getByText } = await render(
    <StarProgressBar progress={{ currentStars: 5, requiredStars: 5 }} />,
  );
  expect(fillPercent(getByTestId('star-progress-fill'))).toBe(100);
  expect(getByText('Reward unlocked')).toBeTruthy();
});

// AC2 — over-threshold (6/5) clamps to 100% and stays unlocked.
test('AC2: 6/5 progress clamps the fill to 100% and stays unlocked', async () => {
  const { getByTestId, getByText } = await render(
    <StarProgressBar progress={{ currentStars: 6, requiredStars: 5 }} />,
  );
  expect(fillPercent(getByTestId('star-progress-fill'))).toBe(100);
  expect(getByText('Reward unlocked')).toBeTruthy();
});

// Edge — singular "1 star" caption at 4/5.
test('caption is singular ("1 star") when exactly one star remains', async () => {
  const { getByText } = await render(
    <StarProgressBar progress={{ currentStars: 4, requiredStars: 5 }} />,
  );
  expect(getByText('1 star to your reward')).toBeTruthy();
});
