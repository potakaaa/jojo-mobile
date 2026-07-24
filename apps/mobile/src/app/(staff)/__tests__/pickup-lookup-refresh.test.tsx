import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';

import PickupLookupScreen from '@/app/(staff)/pickup-lookup';
import { fetchStaffOrderByCode } from '@/features/staff/lib/staff-api';
import { renderWithProviders } from '@/test-utils/render';

/**
 * AC-3 / D1 — Pickup Lookup is an imperative form with no at-rest query, so its
 * pull-to-refresh only clears a stale error state and MUST preserve the typed
 * code (wiping a half-typed code mid-gesture would be hostile — see E2). The
 * physical keyboard-up pull gesture + spinner are AC-8 (Agent-Probe).
 */

jest.mock('@/features/staff/lib/staff-api', () => ({ fetchStaffOrderByCode: jest.fn() }));

const mockLookup = jest.mocked(fetchStaffOrderByCode);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Pickup Lookup — pull-to-refresh (AC-3 / D1)', () => {
  test('onRefresh clears a stale error but preserves the typed code', async () => {
    mockLookup.mockResolvedValue(null); // simulate "no matching order"

    const screen = await renderWithProviders(<PickupLookupScreen />);

    // Type a code (auto-formats to JP-260722-4Q7K), then search to produce the
    // "not found" error state.
    const input = screen.getByPlaceholderText('e.g. JP-260715-4Q7K');
    await act(async () => {
      fireEvent.changeText(input, 'JP2607224Q7K');
    });
    expect(screen.getByDisplayValue('JP-260722-4Q7K')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Find order' }));
    });

    expect(mockLookup).toHaveBeenCalledWith('JP-260722-4Q7K');
    expect(screen.getByText('No matching order found for your branch.')).toBeTruthy();
    expect(screen.getByDisplayValue('JP-260722-4Q7K')).toBeTruthy();

    // Pull-to-refresh clears the error but keeps the typed code.
    const scroll = screen.getByTestId('staff-pickup-lookup-scroll');
    await act(async () => {
      scroll.props.refreshControl.props.onRefresh();
    });

    expect(screen.queryByText('No matching order found for your branch.')).toBeNull();
    expect(screen.getByDisplayValue('JP-260722-4Q7K')).toBeTruthy();
  });
});
