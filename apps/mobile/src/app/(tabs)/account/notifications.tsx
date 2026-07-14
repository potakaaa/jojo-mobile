import { Ionicons } from '@expo/vector-icons';
import type { AppNotification, NotificationType } from '@jojopotato/types';
import { EmptyState, NotificationRow, Toggle } from '@jojopotato/ui';
import { router, type Href } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import { resolveRoute } from '@/features/notifications/lib/notification-factory';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/** type → Ionicons glyph for the row's leading icon. */
const TYPE_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  order_accepted: 'receipt-outline',
  order_preparing: 'receipt-outline',
  order_ready: 'receipt-outline',
  order_cancelled: 'receipt-outline',
  new_deal: 'pricetag-outline',
  branch_promo: 'pricetag-outline',
  coupon_expiring: 'ticket-outline',
  reward_unlocked: 'star-outline',
  one_more_order: 'star-outline',
};

/**
 * Tiny local relative-time formatter (no shared util exists — the only prior
 * one, `formatPlacedAgo`, is private inside `(staff)/active-orders.tsx`). Mirrors
 * that "Just now / N min ago / N h ago / N d ago" shape.
 */
function formatRelativeTime(createdAt: string): string {
  const diffMs = Date.now() - Date.parse(createdAt);
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * Notifications screen (push-notifications-ui). Inline marketing toggle header +
 * an always-on note for order updates, then a newest-first list of mock
 * notifications. Tapping a row marks it read and navigates to its target screen.
 * Empty state when the list is empty. Mock/local state only — #75 swaps the data
 * source via `useNotifications()`.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const insets = useSafeAreaInsets();

  const { notifications, markRead, marketingOptIn, setMarketingOptIn } = useNotifications();

  const onPressItem = (n: AppNotification) => {
    markRead(n.id);
    const r = resolveRoute(n);
    router.push(
      (r.params ? { pathname: r.pathname, params: r.params } : r.pathname) as Href,
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom) + Spacing.four,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.settingsCard, { borderColor: theme.border }]}>
            <Toggle
              label="Marketing notifications"
              value={marketingOptIn}
              onValueChange={setMarketingOptIn}
              mode={mode}
            />
            <Text style={[styles.settingsNote, { color: theme.textSecondary }]}>
              Order updates are always on and can&apos;t be turned off.
            </Text>
          </View>

          {notifications.length === 0 ? (
            <EmptyState
              iconName="notifications-outline"
              title="No notifications yet"
              description="Order updates and deals will show up here."
              mode={mode}
            />
          ) : (
            <View style={styles.list}>
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  title={n.title}
                  body={n.body}
                  timeLabel={formatRelativeTime(n.createdAt)}
                  unread={n.readAt == null}
                  iconName={TYPE_ICON[n.type]}
                  onPress={() => onPressItem(n)}
                  mode={mode}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  settingsCard: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  list: {
    gap: Spacing.three,
  },
  settingsNote: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
  },
});
