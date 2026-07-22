import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';

import { Colors, Radii, type ThemeMode } from '../theme';

export interface SkeletonProps {
  /** Width of the placeholder block. Defaults to filling its parent (`'100%'`). */
  width?: DimensionValue;
  /** Height of the placeholder block (dp). Defaults to a single-line bar. */
  height?: DimensionValue;
  /** Corner radius (dp). Defaults to `Radii.md`. */
  radius?: number;
  mode: ThemeMode;
  style?: ViewStyle;
}

/**
 * Themed placeholder block for loading states. A neutral filled rectangle whose
 * fill is driven by the resolved `mode` (`Colors[mode].backgroundElement`), so
 * light and dark each read the correct surface token — never a hardcoded color.
 *
 * Static fill by design: the shared jest reanimated mock lacks layout-animation
 * exports, so a reanimated pulse would crash under jest. Compose several of these
 * (title-bar + card-grid shapes) to mirror the content that's loading.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = Radii.md,
  mode,
  style,
}: SkeletonProps) {
  const theme = Colors[mode];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius: radius, backgroundColor: theme.backgroundElement },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
});
