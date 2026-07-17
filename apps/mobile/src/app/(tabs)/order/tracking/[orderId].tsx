import { OrderStatusTimeline, Palette } from '@jojopotato/ui';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { isTerminalStatus, useOrderQuery } from '@/features/orders/hooks/use-order-query';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

function EtaCard({ iso }: { iso: string }) {
  const time = new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={eta.outer}>
      <View style={eta.accent} />
      <View style={eta.body}>
        <Text style={eta.eyebrow}>ESTIMATED PICKUP</Text>
        <Text style={eta.time}>{time}</Text>
        <Text style={eta.sub}>{"Head over when it's ready — we'll keep updating this page."}</Text>
      </View>
    </View>
  );
}

function LiveBadge() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.15, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={badge.wrap}>
      <Animated.View style={[badge.dot, dotStyle]} />
      <Text style={badge.text}>LIVE</Text>
    </View>
  );
}

export default function OrderTrackingScreen() {
  const theme = useTheme();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: order, isLoading, error, refetch } = useOrderQuery(orderId);

  if (isLoading) return <ScreenLoader />;
  if (error || !order) {
    return (
      <ScreenMessage
        title="Couldn't load your order"
        subtitle={error?.message ?? 'Order not found.'}
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }

  const live = !isTerminalStatus(order.status);
  const showEta = order.estimatedReadyAt != null && live;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Order number</Text>
          <Text style={[styles.orderNumber, { color: theme.text }]}>{order.orderNumber}</Text>
        </View>
        {live && <LiveBadge />}
      </View>

      {showEta && <EtaCard iso={order.estimatedReadyAt!} />}

      {/* `styles.timelineCard` hardcodes a cream (light) surface, so the timeline
          inside it is pinned to `mode="light"` — its text must read the same
          mode's tokens as the surface it sits on (CLAUDE.md §Theming). Threading
          the device scheme here would paint light-mode text on a cream card in
          dark mode. The fixed-cream surface itself is a separate design question. */}
      <View style={styles.timelineCard}>
        <OrderStatusTimeline currentStatus={order.status} liveMode={live} mode="light" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall },
  orderNumber: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    marginTop: Spacing.half,
  },
  timelineCard: {
    backgroundColor: Palette.cream,
    borderWidth: 2,
    borderColor: Palette.ink,
    borderRadius: 16,
    padding: Spacing.four,
    shadowColor: Palette.ink,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
});

const eta = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: Palette.ink,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Palette.creamTint1,
    shadowColor: Palette.ink,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  accent: {
    width: 6,
    backgroundColor: Palette.green,
  },
  body: {
    flex: 1,
    padding: Spacing.four,
    gap: 4,
  },
  eyebrow: {
    fontFamily: FontFamily.body.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.green,
    textTransform: 'uppercase',
  },
  time: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h2,
    color: Palette.ink,
    lineHeight: TypeScale.h2 * 1.15,
  },
  sub: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
    color: Palette.neutral700,
    marginTop: 2,
    lineHeight: TypeScale.bodySmall * 1.5,
  },
});

const badge = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(26, 154, 74, 0.12)',
    marginBottom: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#1a9a4a',
  },
  text: {
    fontFamily: FontFamily.body.bold,
    fontSize: 11,
    color: '#1a9a4a',
    letterSpacing: 0.8,
  },
});
