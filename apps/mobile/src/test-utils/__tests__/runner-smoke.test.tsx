import { expect, test } from '@jest/globals';
import { EmptyState } from '@jojopotato/ui';

import { renderWithProviders } from '../render';

/**
 * Smoke test proving the new jest-expo runner boots end-to-end under this repo's
 * exact pin (reanimated 4.5.0 / worklets 0.10.0 / RTL 14 / React 19) with the
 * hand-rolled reanimated mock + fixed SafeAreaProvider metrics + async render.
 */
test('jest-expo runner renders a trivial component (EmptyState) without throwing', async () => {
  const { getByText } = await renderWithProviders(
    <EmptyState iconName="star-outline" title="Smoke test" description="Runner boots" />,
  );

  expect(getByText('Smoke test')).toBeTruthy();
  expect(getByText('Runner boots')).toBeTruthy();
});
