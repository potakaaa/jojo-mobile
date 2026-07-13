import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Radii, Spacing, TypeScale, type ThemeMode } from '../theme';
import { Button } from './button';

export interface EmptyStateProps {
  /** Ionicons glyph rendered in the illustration circle. */
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  /** Optional CTA — renders a `<Button>` when both label and handler are set. */
  actionLabel?: string;
  onAction?: () => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * Centered empty-state block: an icon in a themed circle, a title, an optional
 * description, and an optional CTA button. Theme-token driven; used by the Cart
 * screen when the cart has no items (D7).
 */
export function EmptyState({
  iconName,
  title,
  description,
  actionLabel,
  onAction,
  mode = 'light',
  style,
}: EmptyStateProps) {
  const theme = Colors[mode];

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}
      >
        <Ionicons name={iconName} size={40} color={theme.textSecondary} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} mode={mode} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    textAlign: 'center',
  },
  description: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.two,
  },
});
