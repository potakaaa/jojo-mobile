import type { PickupBranch } from '@jojopotato/types';
import { BranchCard } from '@jojopotato/ui';
import { router } from 'expo-router';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useCart } from '@/features/cart/hooks/use-cart';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/**
 * Branch Locator (Branches tab root). Lists the active pickup branches; tapping
 * one sets it as the cart's branch and pushes its detail + menu.
 */
export default function BranchLocatorScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: branches, loading, error, refetch } = useBranches();
  const { setBranch } = useCart();

  const openBranch = (branch: PickupBranch) => {
    setBranch(branch.id);
    router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: branch.id } });
  };

  if (loading) return <ScreenLoader />;
  if (error) {
    return (
      <ScreenMessage
        title="Couldn't load branches"
        subtitle={error}
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }
  if (!branches || branches.length === 0) {
    return <ScreenMessage title="No branches available" subtitle="Please check back soon." />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={branches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <BranchCard branch={item} onPress={() => openBranch(item)} />}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
  content: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.four, gap: Spacing.three },
});
