import {
  Badge,
  Button,
  Card,
  EmptyState,
  RewardProgressCard,
  StarProgressBar,
} from '@jojopotato/ui';
import type { Reward } from '@jojopotato/types';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Palette, Spacing, TypeScale } from '@/constants/theme';
import { useRedeemReward } from '@/features/rewards/hooks/use-redeem-reward';
import { useRewardsCatalog } from '@/features/rewards/hooks/use-rewards-catalog';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { getRewardAffordability } from '@/features/rewards/lib/redeem-eligibility';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Rewards tab root. Shows the member's real star balance + progress
 * (`useRewardsSummary`), a redeemable rewards catalog (`useRewardsCatalog`) with
 * affordability gating, a redeem-with-confirm flow (`useRedeemReward`), and a
 * friendly entry into the coupon wallet. Each data section renders its own
 * loading / empty / error-with-retry state so a slow or failed query never
 * blanks the whole screen.
 */
export default function RewardsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  const summary = useRewardsSummary();
  const catalog = useRewardsCatalog();
  const redeem = useRedeemReward();

  const currentStars = summary.data?.currentStars ?? 0;

  const confirmRedeem = (reward: Reward) => {
    Alert.alert(
      'Redeem reward?',
      `Redeem "${reward.name}" for ${reward.requiredStars} ${reward.requiredStars === 1 ? 'star' : 'stars'}? This will use your stars and add a coupon to your wallet.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem', onPress: () => redeem.mutate(reward.id) },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.screenTitle, { color: theme.text }]}>Rewards</Text>

          {/* Star balance + progress */}
          {summary.isPending ? (
            <SectionLoader />
          ) : summary.isError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn't load your rewards"
              description="Your star balance is unavailable right now."
              actionLabel="Retry"
              onAction={() => void summary.refetch()}
              mode={mode}
            />
          ) : summary.data ? (
            <View style={styles.balanceSection}>
              <RewardProgressCard
                rewards={{
                  userId: '',
                  currentStars: summary.data.currentStars,
                  lifetimeStars: summary.data.lifetimeStars,
                }}
                mode={mode}
              />
              <StarProgressBar
                progress={{
                  currentStars: summary.data.currentStars,
                  rewardThreshold: summary.data.rewardThreshold,
                  starsToNextReward: summary.data.starsToNextReward,
                }}
                mode={mode}
              />
            </View>
          ) : null}

          {/* Coupon wallet entry (replaces the old Dev link) */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/rewards/coupons')}
            style={styles.walletEntry}
          >
            <Card mode={mode} style={styles.walletCard}>
              <Text style={[styles.walletTitle, { color: theme.text }]}>My coupons</Text>
              <Text style={[styles.walletCta, { color: theme.accent }]}>View wallet</Text>
            </Card>
          </Pressable>

          {/* Redeemable rewards catalog */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Redeem your stars</Text>
          {catalog.isPending ? (
            <SectionLoader />
          ) : catalog.isError ? (
            <EmptyState
              iconName="cloud-offline-outline"
              title="Couldn't load rewards"
              description="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void catalog.refetch()}
              mode={mode}
            />
          ) : (catalog.data?.length ?? 0) === 0 ? (
            <EmptyState
              iconName="gift-outline"
              title="No rewards yet"
              description="Earn stars with every order and redeem them here soon."
              mode={mode}
            />
          ) : (
            <View style={styles.rewardsList}>
              {catalog.data!.map((reward) => (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  currentStars={currentStars}
                  isRedeemingThis={redeem.isPending && redeem.variables === reward.id}
                  isGlobalRedeeming={redeem.isPending}
                  onRedeem={() => confirmRedeem(reward)}
                  mode={mode}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

interface RewardRowProps {
  reward: Reward;
  currentStars: number;
  /** True only for the specific reward currently being redeemed (drives its spinner). */
  isRedeemingThis: boolean;
  /** True while ANY reward redemption is in flight (disables every row's button). */
  isGlobalRedeeming: boolean;
  onRedeem: () => void;
  mode: 'light' | 'dark';
}

/** One catalog row: name, cost badge, and an affordability-gated redeem button. */
function RewardRow({
  reward,
  currentStars,
  isRedeemingThis,
  isGlobalRedeeming,
  onRedeem,
  mode,
}: RewardRowProps) {
  const theme = useTheme();
  const affordability = getRewardAffordability(currentStars, reward.requiredStars);

  return (
    <Card mode={mode} style={styles.rewardRow}>
      <View style={styles.rewardInfo}>
        <Text style={[styles.rewardName, { color: theme.text }]} numberOfLines={2}>
          {reward.name}
        </Text>
        <Badge label={`${reward.requiredStars} ${reward.requiredStars === 1 ? 'star' : 'stars'}`} />
      </View>
      <View style={styles.rewardAction}>
        <Button
          label="Redeem"
          size="sm"
          onPress={onRedeem}
          disabled={!affordability.canAfford || isGlobalRedeeming}
          loading={isRedeemingThis}
          mode={mode}
        />
        {affordability.message ? (
          <Text style={[styles.needMore, { color: theme.textSecondary }]}>
            {affordability.message}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** Small centered spinner for a pending data section. */
function SectionLoader() {
  return (
    <View style={styles.sectionLoader}>
      <ActivityIndicator color={Palette.jorange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  screenTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
    marginTop: Spacing.two,
  },
  balanceSection: { gap: Spacing.two },
  walletEntry: { width: '100%' },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletTitle: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  walletCta: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    marginTop: Spacing.half,
  },
  rewardsList: { gap: Spacing.two },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rewardInfo: {
    flex: 1,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  rewardName: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  rewardAction: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  needMore: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  sectionLoader: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
