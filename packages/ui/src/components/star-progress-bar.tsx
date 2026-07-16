import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Palette, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';

/** Star-based progress toward the next reward (STAR-002 stars/threshold model). */
export interface StarProgress {
  currentStars: number;
  requiredStars: number;
}

export interface StarProgressBarProps {
  progress: StarProgress;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Horizontal progress bar toward the next reward. Pure `View`/`StyleSheet` (no
 * external progress library). Width fraction is `currentStars / requiredStars`,
 * clamped to [0, 1] (a `requiredStars` of 0 renders an empty bar). At or above
 * the threshold the caption flips to "Reward unlocked" (AC2); otherwise it shows
 * how many stars remain (AC1).
 */
export function StarProgressBar({ progress, mode = 'light', style }: StarProgressBarProps) {
  const theme = Colors[mode];
  const { currentStars, requiredStars } = progress;
  const fraction = requiredStars > 0 ? Math.min(1, Math.max(0, currentStars / requiredStars)) : 0;
  const percentLabel = `${Math.round(fraction * 100)}%` as `${number}%`;

  const isUnlocked = currentStars >= requiredStars;
  const starsRemaining = Math.max(0, requiredStars - currentStars);
  const caption = isUnlocked
    ? 'Reward unlocked'
    : `${starsRemaining} ${starsRemaining === 1 ? 'star' : 'stars'} to your reward`;

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.track,
          { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
        ]}
      >
        <View
          testID="star-progress-fill"
          style={[styles.fill, { width: percentLabel, backgroundColor: Palette.jgold }]}
        />
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
