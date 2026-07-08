import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAndroidTabBarClearance } from '@/components/android-tab-bar';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ComingSoonProps {
  title: string;
}

/**
 * Shared placeholder screen used by the Order / Rewards / Account tabs until
 * those features are built. Pure presentational — no navigation, no state.
 */
export function ComingSoon({ title }: ComingSoonProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View
          style={[
            styles.content,
            // Keep centered content clear of Android's floating tab bar.
            Platform.OS === 'android' && { paddingBottom: getAndroidTabBarClearance(insets.bottom) },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Coming soon</Text>
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
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  subtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.h3,
  },
});
