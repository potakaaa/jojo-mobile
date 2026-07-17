import { render } from '@testing-library/react-native';

import { BranchListItem } from '../branch-list-item';
import { MOCK_BRANCH } from './mocks';

// AC2 (shared component half): a closed branch never shows a pickup badge, but
// the Open/Closed badge still renders as "Closed".
test('does NOT render the pickup badge when isOpen is false', async () => {
  const { queryByText } = await render(
    <BranchListItem
      branch={{ ...MOCK_BRANCH, isAcceptingPickup: true }}
      isOpen={false}
      showDistance={false}
      isEnabled={false}
    />,
  );

  expect(queryByText('Pickup available')).toBeNull();
  expect(queryByText('Pickup unavailable')).toBeNull();
  // Open/Closed badge still renders in the closed state.
  expect(queryByText('Closed')).not.toBeNull();
  expect(queryByText('Open')).toBeNull();
});

// AC4 (shared component half): an open + accepting branch shows the
// "Pickup available" badge and the "Open" badge.
test('renders "Pickup available" badge when isOpen and isAcceptingPickup are true', async () => {
  const { queryByText } = await render(
    <BranchListItem
      branch={{ ...MOCK_BRANCH, isAcceptingPickup: true }}
      isOpen
      showDistance={false}
      isEnabled
    />,
  );

  expect(queryByText('Pickup available')).not.toBeNull();
  expect(queryByText('Pickup unavailable')).toBeNull();
  expect(queryByText('Open')).not.toBeNull();
  expect(queryByText('Closed')).toBeNull();
});

// AC3 (shared component half): an open + not-accepting branch shows the
// "Pickup unavailable" badge and the "Open" badge.
test('renders "Pickup unavailable" badge when isOpen is true but isAcceptingPickup is false', async () => {
  const { queryByText } = await render(
    <BranchListItem
      branch={{ ...MOCK_BRANCH, isAcceptingPickup: false }}
      isOpen
      showDistance={false}
      isEnabled={false}
    />,
  );

  expect(queryByText('Pickup unavailable')).not.toBeNull();
  expect(queryByText('Pickup available')).toBeNull();
  expect(queryByText('Open')).not.toBeNull();
  expect(queryByText('Closed')).toBeNull();
});
