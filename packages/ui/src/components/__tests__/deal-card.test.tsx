import { render } from '@testing-library/react-native';

import { DealCard } from '../deal-card';
import { MOCK_DEAL } from './mocks';

test('renders DealCard without throwing', async () => {
  await render(<DealCard mode="light" deal={MOCK_DEAL} />);
});

test('renders the available (default) state without the unavailable badge', async () => {
  const { queryByText } = await render(<DealCard mode="light" deal={MOCK_DEAL} available={true} />);
  expect(queryByText('Unavailable at this branch')).toBeNull();
});

test('renders the "Unavailable at this branch" badge when available is false', async () => {
  const { getByText } = await render(<DealCard mode="light" deal={MOCK_DEAL} available={false} />);
  expect(getByText('Unavailable at this branch')).toBeTruthy();
});

// DEAL-005 Phase 3 — scheduleSummary caption row.
test('renders the scheduleSummary caption when provided', async () => {
  const summary = 'Available Mon–Fri, 8:00 AM – 8:25 PM';
  const { queryByText } = await render(
    <DealCard mode="light" deal={MOCK_DEAL} scheduleSummary={summary} />,
  );
  expect(queryByText(summary)).not.toBeNull();
});

test('omits the scheduleSummary row when not provided', async () => {
  const { queryByText } = await render(<DealCard mode="light" deal={MOCK_DEAL} />);
  expect(queryByText('Available Mon–Fri, 8:00 AM – 8:25 PM')).toBeNull();
});

test('renders scheduleSummary in dark mode too', async () => {
  const summary = 'Available until Jul 25, 6:00 PM';
  const { queryByText } = await render(
    <DealCard mode="dark" deal={MOCK_DEAL} scheduleSummary={summary} />,
  );
  expect(queryByText(summary)).not.toBeNull();
});

// home-all-branches AC8/AC9 (render half) — the branch caption row.
test('renders the subtext caption verbatim when provided', async () => {
  const { getByTestId } = await render(
    <DealCard mode="light" deal={MOCK_DEAL} subtext="Available at 2 branches" />,
  );

  expect(getByTestId('deal-card-subtext').props.children).toBe('Available at 2 branches');
});

test('omits the subtext row entirely when not provided', async () => {
  const { queryByTestId } = await render(<DealCard mode="light" deal={MOCK_DEAL} />);

  expect(queryByTestId('deal-card-subtext')).toBeNull();
});

// Passing `subtext` must not resurrect the branch-mismatch badge: the two are
// independent, and Home/Deals now pass only the former.
test('subtext alone never renders the unavailable badge', async () => {
  const { getByTestId, queryByText } = await render(
    <DealCard mode="light" deal={MOCK_DEAL} subtext="Downtown" />,
  );

  expect(getByTestId('deal-card-subtext')).toBeTruthy();
  expect(queryByText('Unavailable at this branch')).toBeNull();
});
