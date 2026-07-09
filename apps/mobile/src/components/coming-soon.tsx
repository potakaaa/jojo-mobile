import { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ComingSoonProps {
  title: string;
  /**
   * Set on pushed (non-tab-root) screens inside a nested stack. Those screens
   * are framed by the native `Stack` header (which provides the back button)
   * and are NOT overlaid by the floating tab bar, so they skip the tab-bar
   * clearance padding. Defaults to `false` (tab-root behavior — reserve the
   * floating-bar clearance).
   */
  isNestedScreen?: boolean;
  /** Optional temporary dev nav links/buttons rendered below the placeholder text. */
  children?: ReactNode;
}

/**
 * Shared placeholder screen used by the Order / Rewards / Account / Branches
 * tabs and their nested screens until those features are built. Pure
 * presentational — no navigation state of its own.
 */
export function ComingSoon({ title, isNestedScreen = false, children }: ComingSoonProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={isNestedScreen ? ['bottom'] : ['top', 'bottom']}>
        <View
          style={[
            styles.content,
            // Keep centered content clear of the floating tab bar on iOS/Android —
            // only on tab-root screens; pushed nested screens are framed by the
            // Stack header and not overlaid by the floating bar.
            Platform.OS !== 'web' &&
              !isNestedScreen && { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Coming soon</Text>
          {children ? <View style={styles.links}>{children}</View> : null}
        </View>
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
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  links: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  subtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.h3,
  },
});
