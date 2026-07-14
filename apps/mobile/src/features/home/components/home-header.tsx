import { Ionicons } from '@expo/vector-icons';
import { BrandWordmark } from '@jojopotato/ui';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MASCOT_IMAGE } from '@/constants/images';
import { Brand, FontFamily, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Home greeting header: mascot (left) + wordmark/tagline, and a notifications
 * bell button (right) with an unread-count dot that opens the Notifications
 * screen.
 */
export function HomeHeader() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { unreadCount } = useNotifications();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Image
          source={MASCOT_IMAGE}
          style={styles.mascot}
          contentFit="contain"
          accessibilityLabel="Jojo mascot"
        />
        <View style={styles.textColumn}>
          <BrandWordmark mode={mode} size={TypeScale.h2} />
          <Text style={[styles.greeting, { color: theme.textSecondary }]} numberOfLines={1}>
            {Brand.tagline}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
          }
          onPress={() => router.push('/(tabs)/account/notifications')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.bellButton, pressed && styles.bellButtonPressed]}
        >
          <Ionicons name="notifications-outline" size={26} color={theme.text} />
          {unreadCount > 0 ? (
            <View
              style={[
                styles.unreadDot,
                { backgroundColor: theme.accent, borderColor: theme.background },
              ]}
            />
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  mascot: {
    width: 44,
    height: 44,
  },
  textColumn: {
    flex: 1,
    gap: 0,
  },
  greeting: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.caption,
  },
  bellButton: {
    position: 'relative',
  },
  bellButtonPressed: {
    opacity: 0.6,
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: Radii.full,
    borderWidth: 1.5,
  },
});
