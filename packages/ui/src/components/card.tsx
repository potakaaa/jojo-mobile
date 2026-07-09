import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Colors, Radii, Shadows, Spacing, type ThemeMode } from '../theme';

export interface CardProps {
  children: ReactNode;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Plain themed container surface: element background, themed border, `md`
 * radius, and the soft-small elevation shadow. The generic building block
 * other content composes into.
 */
export function Card({ children, mode = 'light', style }: CardProps) {
  const theme = Colors[mode];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        Shadows.offsetSm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
});
