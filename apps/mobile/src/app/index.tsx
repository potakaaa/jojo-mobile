import { BrandWordmark, JojoButton } from '@jojopotato/ui';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Brand,
  Colors,
  FontFamily,
  MaxContentWidth,
  Palette,
  Radii,
  Shadows,
  Spacing,
  TypeScale,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const BRAND_SWATCHES = [
  { name: 'cream', hex: Palette.cream },
  { name: 'ink', hex: Palette.ink },
  { name: 'jyellow', hex: Palette.jyellow },
  { name: 'jred', hex: Palette.jred },
  { name: 'jorange', hex: Palette.jorange },
  { name: 'jgold', hex: Palette.jgold },
  { name: 'jbrown', hex: Palette.jbrown },
  { name: 'panel', hex: Palette.panel },
  { name: 'panelBorder', hex: Palette.panelBorder },
] as const;

const NEUTRAL_SWATCHES = [
  { name: 'neutral100', hex: Palette.neutral100 },
  { name: 'neutral200', hex: Palette.neutral200 },
  { name: 'neutral300', hex: Palette.neutral300 },
  { name: 'neutral400', hex: Palette.neutral400 },
  { name: 'neutral500', hex: Palette.neutral500 },
  { name: 'neutral600', hex: Palette.neutral600 },
  { name: 'neutral700', hex: Palette.neutral700 },
  { name: 'neutral800', hex: Palette.neutral800 },
  { name: 'neutral900', hex: Palette.neutral900 },
  { name: 'neutral950', hex: Palette.neutral950 },
] as const;

const DISPLAY_SPECIMEN = [
  { family: FontFamily.display.semibold, label: 'Fredoka 600 SemiBold' },
  { family: FontFamily.display.bold, label: 'Fredoka 700 Bold' },
] as const;

const BODY_SPECIMEN = [
  { family: FontFamily.body.regular, label: 'Plus Jakarta Sans 400 Regular' },
  { family: FontFamily.body.medium, label: 'Plus Jakarta Sans 500 Medium' },
  { family: FontFamily.body.semibold, label: 'Plus Jakarta Sans 600 SemiBold' },
  { family: FontFamily.body.bold, label: 'Plus Jakarta Sans 700 Bold' },
  { family: FontFamily.body.extrabold, label: 'Plus Jakarta Sans 800 ExtraBold' },
] as const;

const SPACING_STEPS = [
  { name: 'half', value: Spacing.half },
  { name: 'one', value: Spacing.one },
  { name: 'two', value: Spacing.two },
  { name: 'three', value: Spacing.three },
  { name: 'four', value: Spacing.four },
  { name: 'five', value: Spacing.five },
  { name: 'six', value: Spacing.six },
] as const;

const RADIUS_STEPS = [
  { name: 'xs', value: Radii.xs },
  { name: 'sm', value: Radii.sm },
  { name: 'md', value: Radii.md },
  { name: 'lg', value: Radii.lg },
  { name: 'xl', value: Radii.xl },
  { name: '2xl', value: Radii['2xl'] },
  { name: '3xl', value: Radii['3xl'] },
] as const;

export default function HomeScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const sectionTitleColor = theme.text;
  const labelColor = theme.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <BrandWordmark mode={mode} size={TypeScale.display} />
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>{Brand.tagline}</Text>
          </View>

          {/* Brand colors */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Brand colors</Text>
          <View style={styles.swatchGrid}>
            {BRAND_SWATCHES.map((c) => (
              <Swatch key={c.name} name={c.name} hex={c.hex} labelColor={labelColor} />
            ))}
          </View>

          {/* Semantic (light mode) */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
            Semantic — light mode
          </Text>
          <View style={styles.swatchGrid}>
            {(Object.keys(Colors.light) as (keyof typeof Colors.light)[]).map((key) => (
              <Swatch key={key} name={key} hex={Colors.light[key]} labelColor={labelColor} />
            ))}
          </View>

          {/* Neutral scale */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Neutral scale</Text>
          <View style={styles.swatchGrid}>
            {NEUTRAL_SWATCHES.map((c) => (
              <Swatch key={c.name} name={c.name} hex={c.hex} labelColor={labelColor} />
            ))}
          </View>

          {/* Typography — display */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
            Typography — Fredoka (display)
          </Text>
          {DISPLAY_SPECIMEN.map((f) => (
            <View key={f.family} style={styles.specimenRow}>
              <Text style={[styles.specimenText, { fontFamily: f.family, color: theme.text }]}>
                Jojo Potato
              </Text>
              <Text style={[styles.specimenLabel, { color: labelColor }]}>{f.label}</Text>
            </View>
          ))}

          {/* Typography — body */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>
            Typography — Plus Jakarta Sans (body)
          </Text>
          {BODY_SPECIMEN.map((f) => (
            <View key={f.family} style={styles.specimenRow}>
              <Text style={[styles.specimenTextBody, { fontFamily: f.family, color: theme.text }]}>
                Order ahead. Pick up fresh.
              </Text>
              <Text style={[styles.specimenLabel, { color: labelColor }]}>{f.label}</Text>
            </View>
          ))}

          {/* Type scale */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Type scale</Text>
          {(Object.keys(TypeScale) as (keyof typeof TypeScale)[]).map((key) => (
            <View key={key} style={styles.specimenRow}>
              <Text
                style={[
                  {
                    fontFamily: FontFamily.body.semibold,
                    fontSize: TypeScale[key],
                    color: theme.text,
                  },
                ]}
              >
                {key} · {TypeScale[key]}px
              </Text>
            </View>
          ))}

          {/* Spacing scale */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Spacing scale</Text>
          <View style={styles.scaleColumn}>
            {SPACING_STEPS.map((s) => (
              <View key={s.name} style={styles.scaleRow}>
                <Text style={[styles.scaleLabel, { color: labelColor }]}>
                  {s.name} · {s.value}
                </Text>
                <View
                  style={[styles.spacingBar, { width: s.value, backgroundColor: theme.accent }]}
                />
              </View>
            ))}
          </View>

          {/* Radius scale */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Radius scale</Text>
          <View style={styles.radiusRow}>
            {RADIUS_STEPS.map((r) => (
              <View key={r.name} style={styles.radiusItem}>
                <View
                  style={[
                    styles.radiusBox,
                    {
                      borderRadius: r.value,
                      backgroundColor: theme.tint,
                      borderColor: theme.border,
                    },
                  ]}
                />
                <Text style={[styles.scaleLabel, { color: labelColor }]}>
                  {r.name} · {r.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Shadow + button demo */}
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Shadows + buttons</Text>
          <View style={styles.shadowRow}>
            <View
              style={[
                styles.shadowCard,
                Shadows.offsetMd,
                { backgroundColor: Palette.cream, borderColor: Palette.ink },
              ]}
            >
              <Text style={styles.shadowCardLabel}>offsetMd</Text>
            </View>
            <View
              style={[
                styles.shadowCard,
                Shadows.softMd,
                { backgroundColor: Palette.cream, borderColor: Palette.ink },
              ]}
            >
              <Text style={styles.shadowCardLabel}>softMd</Text>
            </View>
          </View>
          <View style={styles.buttonColumn}>
            <JojoButton label="Order now" variant="primary" onPress={() => {}} />
            <JojoButton label="Add to cart" variant="accent" onPress={() => {}} />
            <JojoButton label="View menu" variant="ink" onPress={() => {}} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Swatch({ name, hex, labelColor }: { name: string; hex: string; labelColor: string }) {
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchChip, { backgroundColor: hex }]} />
      <Text style={[styles.swatchName, { color: labelColor }]}>{name}</Text>
      <Text style={[styles.swatchHex, { color: labelColor }]}>{hex}</Text>
    </View>
  );
}

const SWATCH_SIZE = 72;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  tagline: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
  },
  sectionTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    marginTop: Spacing.three,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: SWATCH_SIZE,
    gap: Spacing.half,
  },
  swatchChip: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: Radii.md,
    borderWidth: 2,
    borderColor: Palette.ink,
  },
  swatchName: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.caption,
  },
  swatchHex: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  specimenRow: {
    gap: Spacing.half,
  },
  specimenText: {
    fontSize: TypeScale.display,
  },
  specimenTextBody: {
    fontSize: TypeScale.body,
  },
  specimenLabel: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  scaleColumn: {
    gap: Spacing.two,
  },
  scaleRow: {
    gap: Spacing.half,
  },
  scaleLabel: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  spacingBar: {
    height: 16,
    borderRadius: Radii.xs,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  radiusItem: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  radiusBox: {
    width: 56,
    height: 56,
    borderWidth: 2,
  },
  shadowRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  shadowCard: {
    width: 120,
    height: 72,
    borderRadius: Radii.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowCardLabel: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
    color: Palette.ink,
  },
  buttonColumn: {
    gap: Spacing.three,
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
  },
});
