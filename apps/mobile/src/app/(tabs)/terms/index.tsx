import { ScreenHeader } from '@jojopotato/ui';
import { router, useIsFocused } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_FOOTPRINT, useHideTabBarWhile } from '@/components/floating-tab-bar';
import { resolveTabBarClearance } from '@/components/floating-tab-bar.helpers';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { TermsPrivacyBody } from '@/features/legal/components/terms-privacy-body';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Terms & Privacy screen — the root of the top-level `(tabs)/terms` stack,
 * reached only from the Account tab today (`router.push('/(tabs)/terms')`). Shows
 * the shared `<ScreenHeader>` + the combined Terms & Privacy copy from the single
 * shared `features/legal` content module (identical to the pre-auth `(auth)/terms`
 * screen — no copy duplication). See `./_layout.tsx` for why this lives above the tabs.
 */
export default function TermsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  /*
    Hide the floating tab bar on this screen. Terms is a leaf screen you enter and
    leave, but it is the ROOT of its own top-level stack — so `isNestedTabRoute()`
    is false and the bar would otherwise paint here. Gated on FOCUS, not just mount
    (E3): this screen stays mounted in the Tabs navigator after the user navigates
    away, and an always-true flag would leave the bar hidden on the destination.
    Losing focus restores it; unmount also restores. Matches `notifications`/`history`.
  */
  useHideTabBarWhile(useIsFocused());

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        TOP edge only. This stack runs with `headerShown: false` (see ./_layout.tsx),
        so no native header covers the status bar. There is deliberately NO 'bottom'
        edge: the device inset arrives once via resolveTabBarClearance(…) below.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="Terms & Privacy" onBack={() => router.back()} mode={mode} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              // `true` selects the no-footprint branch: the floating bar is HIDDEN on
              // this screen (via useHideTabBarWhile above), so only the device safe-area
              // inset is kept, plus this screen's own breathing room.
              paddingBottom:
                resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <TermsPrivacyBody theme={theme} />
        </ScrollView>
      </SafeAreaView>
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
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
});
