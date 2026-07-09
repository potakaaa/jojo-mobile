import type { RewardsTierProgress } from '@jojopotato/types';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface StarProgressBarProps {
  progress: RewardsTierProgress;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Horizontal progress bar toward the next rewards tier. Pure `View`/`StyleSheet`
 * (no external progress library). Width fraction is
 * `currentPoints / (currentPoints + pointsToNextTier)`, clamped to [0, 1].
 */
export function StarProgressBar({ progress, mode = 'light', style }: StarProgressBarProps) {
  const theme = Colors[mode];
  const { currentPoints, pointsToNextTier, nextTier } = progress;
  const total = currentPoints + pointsToNextTier;
  const fraction = total > 0 ? Math.min(1, Math.max(0, currentPoints / total)) : 1;
  const percentLabel = `${Math.round(fraction * 100)}%` as `${number}%`;

  const caption = nextTier
    ? `${pointsToNextTier} points to ${nextTier}`
    : 'Top tier reached';

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
        <View style={[styles.fill, { width: percentLabel, backgroundColor: Palette.jgold }]} />
      </View>
      <Text style={[styles.caption, { color: theme.textSecondary }]}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  track: {
    height: 12,
    borderRadius: Radii.full,
    borderWidth: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radii.full,
  },
  caption: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
});
