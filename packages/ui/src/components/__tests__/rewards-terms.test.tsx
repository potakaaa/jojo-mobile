import { render } from '@testing-library/react-native';

import { RewardsTerms, REWARDS_TERMS_RULES } from '../rewards-terms';

test('renders RewardsTerms without throwing', async () => {
  await render(<RewardsTerms mode="light" />);
});

// AC4 — the Terms copy is REAL (derived from PRD §6.10), not placeholder/lorem.
test('AC4: renders real, non-lorem Terms copy', async () => {
  const { getByText, queryByText } = await render(<RewardsTerms mode="light" />);

  // A known, specific phrase from the authored copy must be present.
  expect(getByText('Collect 5 stars to unlock a free reward.')).toBeTruthy();
  expect(getByText('You earn 1 Jojo Star for every completed eligible order.')).toBeTruthy();

  // Guard against placeholder text ever shipping.
  expect(queryByText(/lorem ipsum/i)).toBeNull();
});

// AC4 — every authored rule renders.
test('AC4: renders every authored rewards rule', async () => {
  const { getByText } = await render(<RewardsTerms mode="light" />);
  for (const rule of REWARDS_TERMS_RULES) {
    expect(getByText(rule)).toBeTruthy();
  }
});
