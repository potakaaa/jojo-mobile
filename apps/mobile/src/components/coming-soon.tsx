import { ScreenHeader } from '@jojopotato/ui';
import { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export interface ComingSoonProps {
  title: string;
  /**
   * Set on pushed (non-tab-root) screens inside a nested stack. Those screens
   * are NOT overlaid by the floating tab bar, so they skip the tab-bar clearance
   * padding. Defaults to `false` (tab-root behavior — reserve the floating-bar
   * clearance).
   *
   * NOTE: this no longer affects the safe-area `edges` — see the `edges` comment
   * in the render below.
   */
  isNestedScreen?: boolean;
  /**
   * Back handler. When present, a `<ScreenHeader title={title} onBack>` renders
   * at the top of the screen and the bare centered title is dropped (the header
   * carries it instead). When absent, the render is byte-identical to before this
   * prop existed — additive and backward compatible, so tab-root callers that
   * pass no `onBack` are unaffected.
   */
  onBack?: () => void;
  /** Optional temporary dev nav links/buttons rendered below the placeholder text. */
  children?: ReactNode;
}

/**
 * Shared placeholder screen used by the Order / Rewards / Account / Branches
 * tabs and their nested screens until those features are built. Pure
 * presentational — no navigation state of its own.
 */
export function ComingSoon({ title, isNestedScreen = false, onBack, children }: ComingSoonProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        'top' is now UNCONDITIONAL (NAV-003). It used to be dropped for nested
        screens because the native `Stack` header supplied that inset for them —
        but the nested callers (help, coupons) now run `headerShown:false`, so
        skipping 'top' would leave their content under the status bar. Both
        branches are identical, so the ternary is gone.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {onBack ? <ScreenHeader title={title} onBack={onBack} mode={mode} /> : null}
        <View
          style={[
            styles.content,
            // Keep centered content clear of the floating tab bar on iOS/Android —
            // only on tab-root screens; pushed nested screens are not overlaid by
            // the floating bar. Unchanged by NAV-003.
            Platform.OS !== 'web' &&
              !isNestedScreen && { paddingBottom: getFloatingTabBarClearance(insets.bottom) },
          ]}
        >
          {/* The header already shows the title when onBack is set — don't repeat it. */}
          {onBack ? null : <Text style={[styles.title, { color: theme.text }]}>{title}</Text>}
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
