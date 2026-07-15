import type { RewardsProgress } from '@jojopotato/types';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface StarProgressBarProps {
  progress: RewardsProgress;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Horizontal progress bar toward the next reward. Pure `View`/`StyleSheet` (no
 * external progress library). Width fraction is `currentStars / rewardThreshold`,
 * clamped to [0, 1]. Shows "X stars to next reward", or "Reward ready!" when the
 * balance can already redeem (`starsToNextReward === 0`).
 */
export function StarProgressBar({ progress, mode = 'light', style }: StarProgressBarProps) {
  const theme = Colors[mode];
  const { currentStars, rewardThreshold, starsToNextReward } = progress;
  const fraction =
    rewardThreshold > 0 ? Math.min(1, Math.max(0, currentStars / rewardThreshold)) : 1;
  const percentLabel = `${Math.round(fraction * 100)}%` as `${number}%`;

  const caption =
    starsToNextReward > 0 ? `${starsToNextReward} stars to next reward` : 'Reward ready!';

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.track,
          { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
        ]}
      >
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
