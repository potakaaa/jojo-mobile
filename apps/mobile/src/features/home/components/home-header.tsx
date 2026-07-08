import { BrandWordmark } from '@jojopotato/ui';
import { StyleSheet, Text, View } from 'react-native';

import { Brand, FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Home greeting header: brand wordmark + short greeting line. Pure
 * presentational.
 */
export function HomeHeader() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  return (
    <View style={styles.container}>
      <BrandWordmark mode={mode} size={TypeScale.h1} />
      <Text style={[styles.greeting, { color: theme.textSecondary }]}>{Brand.tagline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  greeting: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
});
