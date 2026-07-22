import type { Reward, StarTransaction } from '@jojopotato/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  RewardsTerms,
  StarProgressBar,
  Toast,
} from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance, useRegisterScrollToTop } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { setAppliedCouponCode } from '@/features/cart/applied-coupon-code';
import { useCart } from '@/features/cart/hooks/use-cart';
import { productToMenuItem } from '@/features/cart/lib/product-to-menu-item';
import { resolveAndApplyDeal } from '@/features/deals/lib/apply-deal';
import { useMenu } from '@/features/menu/hooks/use-menu';
import { useNavigateToOrderTracking } from '@/features/orders/lib/navigate-to-tracking';
import { deriveRewardTiers, type RewardTier } from '@/features/rewards/lib/derive-reward-tiers';
import { findEligibleMenuItem } from '@/features/rewards/lib/find-eligible-menu-item';
import { useAvailableRewards } from '@/features/rewards/hooks/use-available-rewards';
import { useMyCoupons } from '@/features/rewards/hooks/use-my-coupons';
import { useRewardsHistory } from '@/features/rewards/hooks/use-rewards-history';
import { useRewardsSummary } from '@/features/rewards/hooks/use-rewards-summary';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useToast } from '@/features/shared/hooks/use-toast';
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
 * Split a transaction's label into a bold heading + an optional secondary
 * line (e.g. "Redeemed reward: Free regular fries or lemonade" ->
 * heading "Redeemed reward", subtitle "Free regular fries or lemonade").
 * Falls back to a heading-only row when there's no ": " to split on.
 */
function splitTxLabel(tx: StarTransaction): { heading: string; subtitle: string | null } {
  const label = txLabel(tx);
  const separatorIndex = label.indexOf(': ');
  if (separatorIndex === -1) return { heading: label, subtitle: null };
  return {
    heading: label.slice(0, separatorIndex),
    subtitle: label.slice(separatorIndex + 2),
  };
}

/**
 * Rewards tab — McDonald's-style unified tier list. Shows the caller's star
 * balance + a progress bar to the next locked tier, one list of ALL active
 * reward tiers (locked → "X more stars needed"; unlocked → Redeem), then the
 * star history. Redeeming applies the reward coupon via `POST /coupons/apply`
 * (`resolveAndApplyDeal` → `applyDiscount`) and opens the cart — the raw coupon
 * code is NEVER rendered. Backed by four react-query hooks (summary / available
 * / history / coupons), all of which refetch on window focus so the screen
 * reflects a server-side star credit or a newly-minted coupon without a restart.
 */
export default function RewardsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const scrollRef = useRef<ScrollView>(null);

  // A5 stage 2: re-tapping the Rewards tab icon while already at this root
  // scrolls the page back to the top.
  useRegisterScrollToTop('rewards', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));

  // A7: star-history rows that came from a real order link back to it.
  const navigateToOrderTracking = useNavigateToOrderTracking();

  const summaryQuery = useRewardsSummary();
  const availableQuery = useAvailableRewards();
  const historyQuery = useRewardsHistory();
  const couponsQuery = useMyCoupons();
  const menuQuery = useMenu();

  const { cart, addItem, applyDiscount } = useCart();
  const { toast, showToast, hideToast } = useToast();
  const [applying, setApplying] = useState(false);

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
  const coupons = couponsQuery.data ?? [];

  // One derivation: the full active tier list (ascending) + the progress-bar
  // target (smallest locked threshold, or null when everything is unlocked).
  const { tiers, nextLockedThreshold } = deriveRewardTiers(
    availableRewards,
    summary.currentStars,
    coupons,
  );
  const allUnlocked = nextLockedThreshold === null;

  const rewardValueLabel = (reward: Reward): string | null =>
    reward.rewardValue === null ? null : formatCurrency(reward.rewardValue);

  /**
   * Redeem an unlocked tier in one tap. Guards on a selected branch, auto-adds the
   * tier's eligible item to the cart (idempotent — skips if already present), then
   * resolves + applies the reward coupon server-side and opens the cart. On any
   * failure it toasts the reason and does NOT navigate; the raw coupon code is never
   * rendered. Double-tap-guarded via `applying`.
   */
  const handleRedeem = async (tier: RewardTier) => {
    if (applying) return;
    setApplying(true);
    try {
      // Branch guard first — no branch means nothing can be added or applied. We
      // navigate to the branch selector rather than auto-selecting (setBranch wipes
      // the cart). Toast wording must contain "pick a branch" (AC1).
      if (!cart.pickupBranchId) {
        showToast('Pick a branch first to redeem your rewards.', 'error');
        router.push('/(tabs)/branches');
        return;
      }

      const { couponCode, reward } = tier;
      const eligibleProductId = reward.eligibleProductId;

      // Auto-add the eligible item (free-item / free-upgrade rewards). Rewards with
      // no eligible product (fixed/percentage discounts) fall straight through to
      // the existing apply path (AC6).
      // cartForValidation is projected forward when we add a new item so the server
      // receives a cart that already contains the item (the local `cart` closure is
      // a React render-time snapshot and stays stale after the await).
      let cartForValidation = cart;
      if (eligibleProductId) {
        const product = findEligibleMenuItem(eligibleProductId, menuQuery.data);
        if (product === null) {
          // Item not available at this branch — stop, stay on screen (AC5).
          showToast("This reward item isn't available at your current branch.", 'error');
          return;
        }
        const alreadyInCart = cart.items.some((i) => i.menuItemId === eligibleProductId);
        if (!alreadyInCart) {
          const ok = await addItem(productToMenuItem(product, true), [], 1);
          if (!ok) {
            showToast('Could not add the reward item. Please try again.', 'error');
            return;
          }
          cartForValidation = {
            ...cart,
            items: [
              ...cart.items,
              {
                lineId: `optimistic-${eligibleProductId}`,
                menuItemId: eligibleProductId,
                quantity: 1,
                productNameSnapshot: product.name,
                unitPriceCents: product.basePriceCents,
                selectedOptions: [],
              },
            ],
          };
        }
      }

      const result = await resolveAndApplyDeal(couponCode!, cartForValidation, cart.pickupBranchId);
      if (!result.ok) {
        showToast(result.message, 'error');
        return;
      }
      applyDiscount(result.discount);
      setAppliedCouponCode(couponCode!);
      router.push('/(tabs)/cart');
    } finally {
      setApplying(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          ref={scrollRef}
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

          {/* Star balance + progress toward the next locked tier (AC1). */}
          <Card style={styles.trackerCard} mode={mode}>
            <View style={styles.trackerHeader}>
              <Text style={[styles.trackerStars, { color: theme.text }]}>
                {summary.currentStars} ★
              </Text>
              {allUnlocked ? <Badge label="All unlocked" variant="success" mode={mode} /> : null}
            </View>
            <StarProgressBar
              progress={{
                currentStars: summary.currentStars,
                requiredStars: nextLockedThreshold ?? summary.currentStars,
              }}
              mode={mode}
            />
            <Text style={[styles.trackerHint, { color: theme.textSecondary }]}>
              {allUnlocked
                ? "You've unlocked every reward — redeem one below."
                : `${Math.max(0, nextLockedThreshold - summary.currentStars)} more stars to your next reward.`}
            </Text>
          </Card>

          {/* Unified tier list (AC2/AC3/AC6) — all active tiers, ascending. */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Rewards</Text>
          {tiers.length === 0 ? (
            <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
              No rewards available yet — check back soon.
            </Text>
          ) : (
            tiers.map((tier) => (
              <Card key={tier.reward.id} style={styles.rewardRow} mode={mode}>
                <View style={styles.rewardRowText}>
                  <Text style={[styles.rewardRowName, { color: theme.text }]}>
                    {tier.reward.name}
                  </Text>
                  {rewardValueLabel(tier.reward) ? (
                    <Text style={[styles.rewardRowValue, { color: theme.textSecondary }]}>
                      Worth {rewardValueLabel(tier.reward)}
                    </Text>
                  ) : null}
                  <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]}>
                    {tier.status === 'locked'
                      ? `${tier.starsNeeded} more stars needed`
                      : `${tier.reward.requiredStars} ★`}
                  </Text>
                </View>
                {tier.status === 'unlocked' ? (
                  <Button
                    label="Redeem"
                    mode={mode}
                    disabled={applying}
                    loading={applying}
                    onPress={() => handleRedeem(tier)}
                  />
                ) : tier.status === 'claimable_no_coupon' ? (
                  <Button label="Redeeming soon" mode={mode} disabled onPress={() => {}} />
                ) : (
                  <Badge label="Locked" variant="default" mode={mode} />
                )}
              </Card>
            ))
          )}

          {/* Star history (AC8) — unchanged logic. */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Star history</Text>
          {history.length === 0 ? (
            <EmptyState
              iconName="star-outline"
              title="No stars yet"
              description="Complete an order to start earning Jojo Stars toward your free reward."
              mode={mode}
            />
          ) : (
            history.map((tx) => {
              const { heading, subtitle } = splitTxLabel(tx);
              // A7: capture in a local so TS narrows it inside the press handler.
              const orderId = tx.orderId;

              /*
                `StarTransaction` carries only the raw `orderId` (a UUID) — no
                order number — so the visible reference is a plain "View order"
                affordance rather than an unreadable id. Rows with no source
                order (manual adjustments / reversals) render neither this text
                nor a press handler: no dead link, no empty placeholder.
              */
              const rowContent = (
                <>
                  <View style={styles.historyRowText}>
                    <Text style={[styles.historyLabel, { color: theme.text }]}>{heading}</Text>
                    {subtitle ? (
                      <Text style={[styles.historySubtitle, { color: theme.textSecondary }]}>
                        {subtitle}
                      </Text>
                    ) : null}
                    <Text style={[styles.historyDate, { color: theme.textSecondary }]}>
                      {formatTxDate(tx.createdAt)}
                    </Text>
                    {orderId != null ? (
                      <Text style={[styles.historyOrderLink, { color: theme.accent }]}>
                        View order
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.historyStars,
                      { color: tx.stars < 0 ? theme.textSecondary : theme.accent },
                    ]}
                  >
                    {tx.stars > 0 ? `+${tx.stars}` : tx.stars} ★
                  </Text>
                </>
              );

              return orderId != null ? (
                <Pressable
                  key={tx.id}
                  accessibilityRole="button"
                  accessibilityLabel={`View order for ${heading}`}
                  onPress={() => navigateToOrderTracking(orderId)}
                  style={[styles.historyRow, { borderBottomColor: theme.border }]}
                >
                  {rowContent}
                </Pressable>
              ) : (
                <View key={tx.id} style={[styles.historyRow, { borderBottomColor: theme.border }]}>
                  {rowContent}
                </View>
              );
            })
          )}

          {/* Terms & Conditions */}
          <Card style={styles.termsCard} mode={mode}>
            <RewardsTerms mode={mode} />
          </Card>
        </ScrollView>
      </SafeAreaView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        severity={toast.severity}
        mode={mode}
        bottomOffset={getFloatingTabBarClearance(insets.bottom) + Spacing.two}
        onDismiss={hideToast}
      />
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
    fontSize: TypeScale.h1,
  },
  trackerHint: {
    fontFamily: FontFamily.body.medium,
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
  rewardRowMeta: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  historyRowText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  historyLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  /** A7 — the "View order" affordance on order-linked star-history rows. */
  historyOrderLink: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
  },
  historySubtitle: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  historyDate: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  historyStars: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.body,
    flexShrink: 0,
  },
  termsCard: {
    marginTop: Spacing.one,
  },
});
