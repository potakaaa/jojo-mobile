import type { RewardsAccount } from '@jojopotato/types';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface RewardsTeaserCardProps {
  rewards: RewardsAccount;
  onPress?: () => void;
}

const TIER_LABEL: Record<RewardsAccount['tier'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

/**
 * Tappable rewards teaser showing the member's current points and tier.
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
      <View style={styles.textColumn}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {TIER_LABEL[rewards.tier]} member
        </Text>
        <Text style={[styles.points, { color: theme.text }]}>{rewards.points} points</Text>
      </View>
      <Text style={[styles.cta, { color: theme.accent }]}>View rewards</Text>
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
  cta: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
});
