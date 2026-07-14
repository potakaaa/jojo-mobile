import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Colors, FontFamily, Radii, Shadows, Spacing, TypeScale, type ThemeMode } from '../theme';

export interface NotificationRowProps {
  title: string;
  body: string;
  /** Pre-formatted relative time label, e.g. "2 min ago". */
  timeLabel: string;
  /** Renders an unread dot + tinted surface when true. */
  unread: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  mode?: ThemeMode;
  style?: ViewStyle;
}

/**
 * A single notification card: a leading themed icon badge, title (with an
 * accent unread dot) + body + relative time, on the repo's standard
 * Pressable-card surface (`Radii.md`, 2px border, `Shadows.offsetSm` — same
 * convention as `Card`/`DealCard`/`BranchCard`). Unread items use the
 * `backgroundSelected` token for a tinted surface. Pressing "sinks" the card
 * by removing the offset shadow, matching the brand's flat hard-shadow style.
 */
export function NotificationRow({
  title,
  body,
  timeLabel,
  unread,
  iconName,
  onPress,
  mode = 'light',
  style,
}: NotificationRowProps) {
  const theme = Colors[mode];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: unread }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: unread ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
        },
        pressed ? styles.cardPressed : Shadows.offsetSm,
        style,
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: theme.background, borderColor: theme.border },
        ]}
      >
        <Ionicons name={iconName} size={20} color={theme.textSecondary} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          {unread ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={[styles.body, { color: theme.textSecondary }]} numberOfLines={2}>
          {body}
        </Text>
        <Text style={[styles.time, { color: theme.textSecondary }]}>{timeLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  cardPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: Spacing.half,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.body,
  },
  body: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
  time: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.caption,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: Radii.full,
  },
});
