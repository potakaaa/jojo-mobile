import { BrandWordmark } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Brand, FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { MASCOT_IMAGE } from '../product-images';

/**
 * Home greeting header: brand wordmark + short greeting line, with the Jojo
 * mascot for personality. Pure presentational.
 */
export function HomeHeader() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.textColumn}>
          <BrandWordmark mode={mode} size={TypeScale.h1} />
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>{Brand.tagline}</Text>
        </View>
        <Image
          source={MASCOT_IMAGE}
          style={styles.mascot}
          contentFit="contain"
          accessibilityLabel="Jojo mascot"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  textColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  greeting: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  mascot: {
    width: 48,
    height: 48,
  },
});
