import type { ProductBranch } from '@jojopotato/types';
import { ConfirmDialog, DealCard, EmptyState, Toast } from '@jojopotato/ui';
import { formatDealScheduleSummary } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useConfirmBranchSwitch } from '@/features/branch/hooks/use-confirm-branch-switch';
import { useDealProducts } from '@/features/deals/hooks/use-deal-products';
import { dealProductToCard } from '@/features/deals/lib/deal-product-to-card';
import { formatBranchSubtext } from '@/features/home/lib/format-branch-subtext';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useToast } from '@/features/shared/hooks/use-toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Deals list (ADM-004 deals-as-products repoint). Renders deal-products
 * (`products.is_deal = true`) from the ALL-BRANCH `GET /deals/products` route via
 * `useDealProducts()`. Same UI shell (`DealCard`/`EmptyState`/`ScreenLoader`) as
 * the old `GET /deals` list. Reached via `router.push('/(tabs)/deals')`.
 *
 * home-all-branches: like the Home strip it shares data and card component with,
 * no card here is ever stamped "Unavailable at this branch" for a mere branch
 * mismatch. Each card instead names the branch(es) that carry the deal, and
 * tapping a deal the selected branch cannot fulfil offers to switch pickup branch
 * first — the switch resolving before Deal Details opens.
 */
export default function DealsListScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();
  const { data: deals = [], isLoading, isError, isRefetching, refetch } = useDealProducts();
  const { selectedBranch } = useBranch();
  const branchSwitch = useConfirmBranchSwitch();
  const { toast, showToast, hideToast } = useToast();
  const [pendingDeal, setPendingDeal] = useState<{ id: string; branch: ProductBranch } | null>(
    null,
  );

  const pushDeal = (dealId: string) => {
    router.push({ pathname: '/(tabs)/deals/deal/[dealId]', params: { dealId } });
  };

  const openDeal = (dealId: string, branches: ProductBranch[] | undefined) => {
    const branchId = selectedBranch?.id;
    const carried =
      !branchId ||
      branches === undefined ||
      branches.length === 0 ||
      branches.some((branch) => branch.id === branchId);

    if (carried) {
      pushDeal(dealId);
      return;
    }
    setPendingDeal({ id: dealId, branch: branches![0]! });
    branchSwitch.requestSwitch(branches![0]!.id);
  };

  const confirmSwitch = async () => {
    const pending = pendingDeal;
    setPendingDeal(null);
    if (!pending) return;
    // Switch first, navigate second — Deal Details resolves against the newly
    // selected branch.
    const switched = await branchSwitch.confirm();
    if (!switched) {
      showToast('That branch is no longer available — please try another deal.', 'error');
      return;
    }
    pushDeal(pending.id);
  };

  const cancelSwitch = () => {
    setPendingDeal(null);
    branchSwitch.cancel();
  };

  if (isLoading) return <ScreenLoader />;
  // Full error screen only when there's nothing loaded yet. A failed REFRESH keeps
  // `isError` true but retains prior deals in `data` — gate on `deals.length === 0`
  // so a failed pull-to-refresh never blanks the already-loaded list (AC3).
  if (isError && deals.length === 0) {
    return (
      <ScreenMessage
        title="Couldn't load deals"
        subtitle="Please try again."
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          testID="deals-scroll"
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              testID="deals-refresh"
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={theme.text}
              colors={[theme.text]}
            />
          }
        >
          <Text style={[styles.heading, { color: theme.text }]}>Deals</Text>
          {deals.length === 0 ? (
            <EmptyState
              iconName="pricetag-outline"
              title="No deals right now"
              description="Check back soon for new offers."
              mode={mode}
            />
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={dealProductToCard(deal)}
                /*
                  `available` is deliberately NOT passed (home-all-branches
                  L3/AC9) — it reflects only the CURRENTLY-selected branch, so
                  passing it stamped "Unavailable at this branch" on deals other
                  branches can fulfil right now. `branches` carries the real
                  signal; an empty list simply renders no subtext.
                */
                mode={mode}
                scheduleSummary={formatDealScheduleSummary(deal.schedule)}
                subtext={formatBranchSubtext(deal.branches)}
                onPress={() => openDeal(deal.id, deal.branches)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingDeal !== null}
        title="Switch branch?"
        message={
          pendingDeal === null
            ? undefined
            : branchSwitch.willClearCart
              ? `This is from ${pendingDeal.branch.name}. Switch your pickup branch? Your current cart will be cleared.`
              : `This is from ${pendingDeal.branch.name}. Switch your pickup branch?`
        }
        confirmLabel={branchSwitch.willClearCart ? 'Clear and switch' : 'Switch branch'}
        cancelLabel="Cancel"
        variant={branchSwitch.willClearCart ? 'destructive' : 'default'}
        mode={mode}
        onConfirm={confirmSwitch}
        onCancel={cancelSwitch}
      />

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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  heading: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
});
