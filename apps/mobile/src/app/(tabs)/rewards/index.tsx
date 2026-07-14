import type { Reward, StarTransaction } from '@jojopotato/types';
import { Badge, Card, EmptyState, RewardsTerms, StarProgressBar } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useAvailableRewards } from '@/features/rewards/hooks/use-available-rewards';
import { useRewardsHistory } from '@/features/rewards/hooks/use-rewards-history';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** Format an ISO date as a short local date (e.g. "Jul 13"). */
function formatTxDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Human label for a star transaction row. */
function txLabel(tx: StarTransaction): string {
  if (tx.description) return tx.description;
  switch (tx.type) {
    case 'earned':
      return 'Star earned';
    case 'adjusted':
      return 'Star adjusted';
    case 'redeemed':
      return 'Star redeemed';
    case 'expired':
      return 'Star expired';
    default:
      return 'Star transaction';
  }
}

/**
 * Rewards tab (STAR-002). Shows the caller's star progress toward the next
 * reward, the reward preview, the available-rewards catalog, the reverse-chron
 * star history, and the T&C. Backed by three react-query hooks (summary /
 * available / history), all of which refetch on window focus so the screen
 * reflects a server-side star credit without an app restart (AC5).
 */
export default function RewardsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const summaryQuery = useRewardsSummary();
  const availableQuery = useAvailableRewards();
  const historyQuery = useRewardsHistory();

  // Loading: wait for the primary summary (the tracker) before rendering.
  if (summaryQuery.isLoading) return <ScreenLoader />;

  // Error: if the summary failed there is nothing meaningful to show.
  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <ScreenMessage
        title="Couldn't load your rewards"
        subtitle="Please check your connection and try again."
        actionLabel="Retry"
        onAction={() => summaryQuery.refetch()}
      />
    );
  }

  const summary = summaryQuery.data;
  const availableRewards = availableQuery.data ?? [];
  const history = historyQuery.data?.transactions ?? [];

  const rewardValueLabel = (reward: Reward): string | null =>
    reward.rewardValue === null ? null : formatCurrency(reward.rewardValue);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: theme.text }]}>Jojo Stars</Text>

          {/* Progress tracker (AC1/AC2) */}
          <Card style={styles.trackerCard} mode={mode}>
            <View style={styles.trackerHeader}>
              <Text style={[styles.trackerStars, { color: theme.text }]}>
                {summary.currentStars} of {summary.requiredStars} stars
              </Text>
              {summary.isUnlocked ? (
                <Badge label="Reward ready" variant="success" mode={mode} />
              ) : null}
            </View>
            <StarProgressBar
              progress={{
                currentStars: summary.currentStars,
                requiredStars: summary.requiredStars,
              }}
              mode={mode}
            />
            {summary.reward ? (
              <View style={styles.rewardPreview}>
                <Text style={[styles.rewardLabel, { color: theme.textSecondary }]}>
                  Your reward
                </Text>
                <Text style={[styles.rewardName, { color: theme.text }]}>
                  {summary.reward.name}
                </Text>
                {rewardValueLabel(summary.reward) ? (
                  <Text style={[styles.rewardValue, { color: theme.accent }]}>
                    Worth {rewardValueLabel(summary.reward)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Card>

          {/* Available rewards */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Available rewards</Text>
          {availableRewards.length === 0 ? (
            <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
              No rewards available right now.
            </Text>
          ) : (
            availableRewards.map((reward) => (
              <Card key={reward.id} style={styles.rewardRow} mode={mode}>
                <View style={styles.rewardRowText}>
                  <Text style={[styles.rewardRowName, { color: theme.text }]}>{reward.name}</Text>
                  {rewardValueLabel(reward) ? (
                    <Text style={[styles.rewardRowValue, { color: theme.textSecondary }]}>
                      Worth {rewardValueLabel(reward)}
                    </Text>
                  ) : null}
                </View>
                <Badge label={`${reward.requiredStars} stars`} mode={mode} />
              </Card>
            ))
          )}

          {/* Reward history (AC3) */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Star history</Text>
          {history.length === 0 ? (
            <EmptyState
              iconName="star-outline"
              title="No stars yet"
              description="Complete an order to start earning Jojo Stars toward your free reward."
              mode={mode}
            />
          ) : (
            history.map((tx) => (
              <View key={tx.id} style={[styles.historyRow, { borderBottomColor: theme.border }]}>
                <View style={styles.historyRowText}>
                  <Text style={[styles.historyLabel, { color: theme.text }]}>{txLabel(tx)}</Text>
                  <Text style={[styles.historyDate, { color: theme.textSecondary }]}>
                    {formatTxDate(tx.createdAt)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyStars,
                    { color: tx.stars < 0 ? theme.textSecondary : theme.accent },
                  ]}
                >
                  {tx.stars > 0 ? `+${tx.stars}` : tx.stars} ★
                </Text>
              </View>
            ))
          )}

          {/* Terms & Conditions (AC4) */}
          <Card style={styles.termsCard} mode={mode}>
            <RewardsTerms mode={mode} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
    marginTop: Spacing.two,
  },
  trackerCard: {
    gap: Spacing.two,
  },
  trackerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackerStars: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  rewardPreview: {
    gap: Spacing.half,
  },
  rewardLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  rewardName: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  rewardValue: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    marginTop: Spacing.one,
  },
  emptyLine: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rewardRowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rewardRowName: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  rewardRowValue: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  historyRowText: {
    gap: Spacing.half,
  },
  historyLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  historyDate: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  historyStars: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.body,
  },
  termsCard: {
    marginTop: Spacing.one,
  },
});
