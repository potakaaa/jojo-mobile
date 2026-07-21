import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

/** Star-based rewards state for the teaser card (STAR-002 stars/threshold model). */
export interface RewardProgress {
  currentStars: number;
  requiredStars: number;
}

export interface RewardProgressCardProps {
  rewards: RewardProgress;
  onPress?: () => void;
  mode: ThemeMode;
}

/**
 * Tappable rewards teaser showing the member's current star progress toward
 * their next reward. Tapping toggles a local pressed highlight — it does not
 * navigate.
 */
export function RewardProgressCard({ rewards, onPress, mode }: RewardProgressCardProps) {
  const theme = Colors[mode];
  const [pressed, setPressed] = useState(false);
  const isUnlocked = rewards.currentStars >= rewards.requiredStars;

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
        <Ionicons name="star" size={24} color={Palette.ink} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {isUnlocked ? 'Reward unlocked' : 'Jojo Stars'}
        </Text>
        <Text style={[styles.points, { color: theme.text }]}>
          {rewards.currentStars} of {rewards.requiredStars} stars
        </Text>
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
