import type { PickupBranch } from '@jojopotato/types';
import { BranchCard } from '@jojopotato/ui';
import { router } from 'expo-router';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/**
 * Branch Locator (Branches tab root). Lists the active pickup branches; tapping
 * one sets it as the currently-browsing branch (`BranchProvider`) and pushes its
 * detail + menu. Browsing does NOT touch the cart's branch (plan Gap C) — the
 * cart branch is only set at add-to-cart time.
 */
export default function BranchLocatorScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { branches, isLoading, isError, refetch, setSelectedBranch } = useBranch();

  const openBranch = (branch: PickupBranch) => {
    setSelectedBranch(branch);
    router.push({ pathname: '/(tabs)/branches/[branchId]', params: { branchId: branch.id } });
  };

  if (isLoading) return <ScreenLoader />;
  if (isError) {
    return (
      <ScreenMessage
        title="Couldn't load branches"
        subtitle="Please try again."
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }
  if (branches.length === 0) {
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
