import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme';

/**
 * Static promotional banner. Purely presentational — no props, no mock-data
 * dependency.
 */
export function PromoBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Limited time</Text>
      <Text style={styles.headline}>Buy one, get fries free</Text>
      <Text style={styles.body}>Order ahead and skip the line at your favorite branch.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
    padding: Spacing.four,
    borderRadius: Radii.lg,
    borderWidth: 2,
    borderColor: Palette.ink,
    backgroundColor: Palette.jyellow,
    ...Shadows.offsetMd,
  },
  eyebrow: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption,
    color: Palette.jred,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    color: Palette.ink,
  },
  body: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
  },
});
