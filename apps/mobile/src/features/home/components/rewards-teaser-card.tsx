import { Ionicons } from '@expo/vector-icons';
import type { RewardsAccount } from '@jojopotato/types';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface RewardsTeaserCardProps {
  rewards: RewardsAccount;
  onPress?: () => void;
}

/**
 * Tappable rewards teaser showing the member's current star balance.
 * Tapping toggles a local pressed highlight — it does not navigate.
 */
export function RewardsTeaserCard({ rewards, onPress }: RewardsTeaserCardProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setPressed((p) => !p);
        onPress?.();
      }}
      style={[
        styles.container,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: Palette.jgold, borderColor: theme.border }]}>
        <Ionicons name="star" size={18} color={Palette.ink} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Rewards member</Text>
        <Text style={[styles.points, { color: theme.text }]}>{rewards.currentStars} stars</Text>
      </View>
      <View style={styles.ctaRow}>
        <Text style={[styles.cta, { color: theme.accent }]}>View rewards</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  points: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  cta: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
});
