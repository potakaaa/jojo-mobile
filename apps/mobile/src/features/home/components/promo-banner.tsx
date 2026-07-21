import { Button } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { PRODUCT_TRIO_IMAGE } from '@/constants/images';
import { FontFamily, Palette, Radii, Shadows, Spacing, TypeScale } from '@/constants/theme';

export interface PromoBannerProps {
  onPress?: () => void;
}

/**
 * Hero-style promotional banner mirroring the jojopotato.ph landing hero: bold
 * headline copy, a CTA button, and the real product-trio photography bleeding
 * off the right edge. Purely presentational — no mock-data dependency.
 *
 * Deliberately fixed-mode: the banner surface is a hardcoded brand yellow
 * (`Palette.jyellow`) with fixed `Palette.ink` copy in BOTH themes, so it is a
 * permanently-light surface. The CTA is therefore pinned to `mode="light"` to
 * match the surface it sits on, per CLAUDE.md §Theming — threading the device
 * scheme would render a dark-mode button on a permanently-yellow card.
 */
export function PromoBanner({ onPress }: PromoBannerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <Text style={styles.eyebrow}>Limited time</Text>
        <Text style={styles.headline}>Buy one,{'\n'}get fries free</Text>
        <Text style={styles.body}>Order ahead and skip the line at your favorite branch.</Text>
        <Button
          label="Order now"
          onPress={onPress ?? (() => {})}
          variant="accent"
          style={styles.cta}
          mode="light"
        />
      </View>
      <Image
        source={PRODUCT_TRIO_IMAGE}
        style={styles.image}
        contentFit="contain"
        accessibilityLabel="Jojo Potato flavored fries cups"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    paddingRight: Spacing.two,
    borderRadius: Radii.lg,
    borderWidth: 2,
    borderColor: Palette.ink,
    backgroundColor: Palette.jyellow,
    overflow: 'hidden',
    ...Shadows.offsetMd,
  },
  textColumn: {
    flex: 1,
    gap: Spacing.half,
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
    lineHeight: TypeScale.h2 * 1.1,
    color: Palette.ink,
  },
  body: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  image: {
    width: 108,
    height: 108,
  },
});
