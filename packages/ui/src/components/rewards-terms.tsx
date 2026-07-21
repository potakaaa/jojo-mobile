import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface RewardsTermsProps {
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Jojo Stars Terms & Conditions (STAR-002 / PRD §6.10). Real, concise copy —
 * NOT lorem/placeholder. Theme-token driven, `mode`-aware. The individual rules
 * are exported so tests (and future callers) can assert on the exact wording.
 */
export const REWARDS_TERMS_TITLE = 'Jojo Stars Terms & Conditions';

export const REWARDS_TERMS_RULES = [
  'You earn 1 Jojo Star for every completed eligible order.',
  'Your order must reach the minimum amount to earn a star.',
  "Cancelled and refunded orders don't earn stars.",
  'Collect 5 stars to unlock a free reward.',
  'Stars have no cash value and cannot be transferred.',
] as const;

export function RewardsTerms({ mode, style }: RewardsTermsProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.title, { color: theme.text }]}>{REWARDS_TERMS_TITLE}</Text>
      {REWARDS_TERMS_RULES.map((rule) => (
        <View key={rule} style={styles.row}>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{'•'}</Text>
          <Text style={[styles.rule, { color: theme.textSecondary }]}>{rule}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  bullet: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  rule: {
    flex: 1,
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});
