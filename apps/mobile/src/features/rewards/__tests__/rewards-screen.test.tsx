import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { Reward } from '@jojopotato/types';
import { fireEvent } from '@testing-library/react-native';
import type { UseQueryResult } from '@tanstack/react-query';

import RewardsScreen from '@/app/(tabs)/rewards';
import { useRedeemReward } from '@/features/rewards/hooks/use-redeem-reward';
import { useRewardsCatalog } from '@/features/rewards/hooks/use-rewards-catalog';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { renderWithProviders, spyOnAlert } from '@/test-utils/render';

// Hooks are mocked so the screen renders against fixed data. `jest.mock` is
// hoisted above these imports at runtime, so the imported bindings are the mocks.
jest.mock('@/features/rewards/hooks/use-rewards-summary');
jest.mock('@/features/rewards/hooks/use-rewards-catalog');
jest.mock('@/features/rewards/hooks/use-redeem-reward');

const mockSummary = jest.mocked(useRewardsSummary);
const mockCatalog = jest.mocked(useRewardsCatalog);
const mockRedeem = jest.mocked(useRedeemReward);

/** Minimal query-result stub — only the fields the screen reads. */
function queryStub<T>(over: Partial<{ data: T; isPending: boolean; isError: boolean }>) {
  return {
    data: over.data,
    isPending: over.isPending ?? false,
    isError: over.isError ?? false,
    refetch: jest.fn(),
  } as unknown as UseQueryResult<T>;
}

type BalanceData = {
  currentStars: number;
  lifetimeStars: number;
  rewardThreshold: number;
  starsToNextReward: number;
};

const mutateSpy = jest.fn();

function reward(over: Partial<Reward> = {}): Reward {
  return {
    id: 'r1',
    name: 'Free Fries',
    requiredStars: 5,
    rewardType: 'free_item',
    rewardValue: null,
    eligibleProductId: null,
    isActive: true,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedeem.mockReturnValue({
    mutate: mutateSpy,
    isPending: false,
  } as unknown as ReturnType<typeof useRedeemReward>);
});

describe('RewardsScreen', () => {
  test('renders real balance, progress, and the redeemable catalog', async () => {
    mockSummary.mockReturnValue(
      queryStub({
        data: { currentStars: 5, lifetimeStars: 12, rewardThreshold: 5, starsToNextReward: 0 },
      }),
    );
    // requiredStars 3 (badge "3 stars") stays distinct from the balance "5 stars".
    mockCatalog.mockReturnValue(
      queryStub({ data: [reward({ name: 'Free Fries', requiredStars: 3 })] }),
    );

    const { getByText } = await renderWithProviders(<RewardsScreen />);

    expect(getByText('5 stars')).toBeTruthy(); // RewardProgressCard balance
    expect(getByText('Reward ready!')).toBeTruthy(); // StarProgressBar caption at threshold
    expect(getByText('Free Fries')).toBeTruthy(); // catalog row
    expect(getByText('3 stars')).toBeTruthy(); // reward cost badge
  });

  test('disables redeem and shows "need N more stars" when unaffordable', async () => {
    mockSummary.mockReturnValue(
      queryStub({
        data: { currentStars: 2, lifetimeStars: 2, rewardThreshold: 5, starsToNextReward: 3 },
      }),
    );
    mockCatalog.mockReturnValue(queryStub({ data: [reward({ requiredStars: 5 })] }));
    const alertSpy = spyOnAlert();

    const { getByText, getByRole } = await renderWithProviders(<RewardsScreen />);

    expect(getByText('Need 3 more stars')).toBeTruthy();
    // Disabled button: pressing must not open the confirm dialog.
    fireEvent.press(getByRole('button', { name: 'Redeem' }));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('redeem button opens a confirm dialog, then fires the mutation on confirm', async () => {
    mockSummary.mockReturnValue(
      queryStub({
        data: { currentStars: 5, lifetimeStars: 5, rewardThreshold: 5, starsToNextReward: 0 },
      }),
    );
    mockCatalog.mockReturnValue(queryStub({ data: [reward({ id: 'r1', requiredStars: 5 })] }));
    const alertSpy = spyOnAlert();

    const { getByRole } = await renderWithProviders(<RewardsScreen />);

    fireEvent.press(getByRole('button', { name: 'Redeem' }));
    expect(alertSpy).toHaveBeenCalledTimes(1);

    // Invoke the confirm button's onPress from the Alert buttons argument.
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    const confirm = buttons.find((b) => b.text === 'Redeem');
    confirm?.onPress?.();

    // Called with the reward id plus an onError handler (surfaces a friendly
    // Alert on redeem failure — e.g. 409 insufficient stars or a race).
    expect(mutateSpy).toHaveBeenCalledWith('r1', { onError: expect.any(Function) });
  });

  test('shows a loading state while the balance query is pending', async () => {
    mockSummary.mockReturnValue(queryStub<BalanceData>({ isPending: true }));
    mockCatalog.mockReturnValue(queryStub<Reward[]>({ isPending: true }));

    const { queryByText } = await renderWithProviders(<RewardsScreen />);

    // Pending branch: balance + catalog not yet rendered.
    expect(queryByText('5 stars')).toBeNull();
    expect(queryByText('Free Fries')).toBeNull();
  });

  test('shows an empty state when the catalog is empty', async () => {
    mockSummary.mockReturnValue(
      queryStub({
        data: { currentStars: 0, lifetimeStars: 0, rewardThreshold: 5, starsToNextReward: 5 },
      }),
    );
    mockCatalog.mockReturnValue(queryStub({ data: [] }));

    const { getByText } = await renderWithProviders(<RewardsScreen />);

    expect(getByText('No rewards yet')).toBeTruthy();
  });

  test('shows an error + retry state when the catalog query fails, and retry refetches', async () => {
    mockSummary.mockReturnValue(
      queryStub({
        data: { currentStars: 3, lifetimeStars: 3, rewardThreshold: 5, starsToNextReward: 2 },
      }),
    );
    const catalogResult = queryStub<Reward[]>({ isError: true });
    mockCatalog.mockReturnValue(catalogResult);

    const { getByText, getByRole } = await renderWithProviders(<RewardsScreen />);

    expect(getByText("Couldn't load rewards")).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Retry' }));
    expect(catalogResult.refetch).toHaveBeenCalled();
  });
});
