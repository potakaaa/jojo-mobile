import { CUSTOMER_CANCEL_REASONS, resolveReasonLabel } from '@jojopotato/types';
import type { Order } from '@jojopotato/types';
import { Button, ConfirmDialog, OrderStatusTimeline, Palette, ScreenHeader } from '@jojopotato/ui';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHideTabBarWhile } from '@/components/floating-tab-bar';
import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { useCancelOrder } from '@/features/orders/hooks/use-cancel-order';
import { useCompleteOrder } from '@/features/orders/hooks/use-complete-order';
import { isTerminalStatus, useOrderQuery } from '@/features/orders/hooks/use-order-query';
import { ReasonDialog } from '@/features/shared/components/reason-dialog';
import { ScreenLoader, ScreenMessage } from '@/features/shared/components/screen-message';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Customer-facing terminal-reason block (CodeRabbit PR #156).
 *
 * The SPEC's problem statement opens with "when staff reject an order, the
 * customer never learns why — the app just shows 'rejected'". The reason was
 * being captured, stored, serialized and rendered on the STAFF order-detail
 * screen, but never on the one screen the customer actually looks at, so that
 * stated gap was still open. This closes it.
 *
 * Deliberately phrased in the customer's voice rather than reusing the staff
 * screen's copy: staff see "Rejected by staff", which is information the
 * customer already has from the status itself. What they lack is the WHY.
 *
 * `resolveReasonLabel` is the shared mapper from `@jojopotato/types` — it keys
 * off `reasonActor` because staff and customer draw from two different code
 * tables and the same code string could otherwise resolve to the wrong copy.
 * Renders nothing unless the order is genuinely terminal AND carries a reason,
 * so a plain cancellation with no reason given adds no empty chrome.
 */
function OrderReasonBlock({
  order,
}: {
  order: Pick<Order, 'status' | 'reasonCode' | 'reasonNote' | 'reasonActor'>;
}) {
  const theme = useTheme();
  const isTerminalWithReason = order.status === 'rejected' || order.status === 'cancelled';
  // `reasonActor` MUST be threaded through, never hardcoded: an order the
  // customer cancelled themselves resolves against CUSTOMER_CANCEL_REASONS,
  // while a staff rejection resolves against STAFF_REJECT_REASONS. The two
  // tables share no codes today, but assuming one actor would silently render
  // the wrong copy the moment they overlap.
  const label = resolveReasonLabel(order.reasonCode, order.reasonActor);
  if (!isTerminalWithReason || (!label && !order.reasonNote)) return null;

  return (
    <View testID="tracking-reason-block" style={styles.reasonCard}>
      <Text style={[styles.reasonHeading, { color: theme.text }]}>
        {order.status === 'rejected' ? "Why this order wasn't accepted" : 'Why this was cancelled'}
      </Text>
      {label ? <Text style={[styles.reasonLabel, { color: theme.text }]}>{label}</Text> : null}
      {order.reasonNote ? (
        <Text style={[styles.reasonNote, { color: theme.textSecondary }]}>{order.reasonNote}</Text>
      ) : null}
    </View>
  );
}

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
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: order, isLoading, error, refetch } = useOrderQuery(orderId);
  const completion = useCompleteOrder();
  const cancellation = useCancelOrder();

  /*
    The customer's own "picked up" confirmation. Unlike the staff button
    (`(staff)/order-detail/[orderId].tsx`), which fires immediately, this one is
    gated behind a ConfirmDialog. That inconsistency is DELIBERATE, not an
    oversight — please don't "fix" it: `completed` is terminal with no exit in
    the state machine, and a customer taps this unprompted on their own phone
    with no one to undo a mistap. Staff act on a shared device with a colleague
    and a counter queue as context.

    `useState` sits above the loading/error early returns below — this component
    has three return branches and hooks must run on every one (Rules of Hooks).
  */
  const [confirmVisible, setConfirmVisible] = useState(false);

  /*
    B3 — the customer's own cancel. Same "hooks run on every return branch"
    constraint as `confirmVisible` above, so it is declared here rather than
    beside the JSX that uses it.
  */
  const [cancelVisible, setCancelVisible] = useState(false);

  /*
    Hide the floating tab bar on this screen. Tracking is a leaf screen you enter
    and leave, and since NAV-004 it is the ROOT of its own TOP-LEVEL stack — so
    `isNestedTabRoute()` is false and the bar would otherwise paint here.
    `useHideTabBarWhile` is the existing cross-tree seam for exactly this (it is
    OR-composed with the nested check in floating-tab-bar.tsx). Gated on FOCUS,
    not just mount: this screen stays mounted in the Tabs navigator after the user
    navigates away, and an always-true flag would leave the bar hidden on the
    destination. Losing focus restores it; unmount also restores.

    This hook sits ABOVE the loading/error early returns below — hooks must run on
    every render path (Rules of Hooks), and this component has three return
    branches.
  */
  useHideTabBarWhile(useIsFocused());

  /*
    All three return paths (loading / error / loaded) render the SAME header
    inside the SAME safe-area wrapper. The native header used to cover the
    loading and error branches for free — with `headerShown:false` (see
    ./_layout.tsx) an unwrapped early return would lose both its status-bar
    clearance and its only way back, visible whenever the fetch is slow or the
    order id is bad.
  */
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <ScreenHeader title="Order Tracking" onBack={() => router.back()} mode={mode} />
          <ScreenLoader />
        </SafeAreaView>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <ScreenHeader title="Order Tracking" onBack={() => router.back()} mode={mode} />
          <ScreenMessage
            title="Couldn't load your order"
            subtitle={error?.message ?? 'Order not found.'}
            actionLabel="Retry"
            onAction={refetch}
          />
        </SafeAreaView>
      </View>
    );
  }

  const live = !isTerminalStatus(order.status);
  const showEta = order.estimatedReadyAt != null && live;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        'top' AND 'bottom' (NAV-003): this screen previously had NO SafeAreaView
        and no device inset at all — its bottom padding was a static Spacing.six.
        This stack now runs `headerShown:false`, so 'top' is required for the
        ScreenHeader; 'bottom' supplies the device inset that was missing.
        The static `paddingBottom: Spacing.six` on styles.content stays as-is —
        it is breathing room, a different concern from the device inset, so the
        two together are NOT a double-count. This screen has no bottom CTA and no
        resolveTabBarClearance call: this SafeAreaView is the only inset source.

        NAV-004 does not change any of the above. The tab bar is now EXPLICITLY
        hidden here (via useHideTabBarWhile above) rather than implicitly absent,
        but no footprint was ever reserved for it on this screen, so there is
        nothing to reclaim: the device inset still arrives exactly ONCE, from this
        SafeAreaView.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Order Tracking" onBack={() => router.back()} mode={mode} />
        <ScrollView
          style={styles.scroll}
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

          {/* Terminal-reason explanation, above the timeline so it is the first
              thing read after the status itself — a rejected customer wants the
              WHY before the history of how it got there. */}
          <OrderReasonBlock order={order} />

          <View style={styles.timelineCard}>
            {/* `styles.timelineCard` hardcodes a cream (light) surface, so the timeline
                inside it is pinned to `mode="light"` — its text must read the same
                mode's tokens as the surface it sits on (CLAUDE.md §Theming). Threading
                the device scheme here would paint light-mode text on a cream card in
                dark mode. The fixed-cream surface itself is a separate design question. */}
            <OrderStatusTimeline currentStatus={order.status} liveMode={live} mode="light" />
          </View>

          {/*
            Customer self-confirm pickup. Shown ONLY for `ready` — an equality
            check, not `!isTerminalStatus(...)`: `ready` is the single status the
            server route will accept, so offering the button any earlier would
            just earn a 409.

            SURFACE / THEMING: this block sits in the ScrollView's own content,
            BELOW `styles.timelineCard` — i.e. on the screen's themed background
            (`theme.background`), NOT on the card's hardcoded cream surface. So it
            takes the DEVICE-SCHEME `mode`, unlike the timeline above which is
            pinned `mode="light"` to match the cream it sits on (CLAUDE.md
            §Theming). Do not copy the timeline's `mode="light"` down here.
          */}
          {order.status === 'ready' && (
            <View style={styles.pickupAction}>
              <Button
                testID="mark-picked-up-button"
                label="I've picked this up"
                variant="primary"
                mode={mode}
                loading={completion.isPending}
                onPress={() => setConfirmVisible(true)}
              />
              {completion.error ? (
                <Text style={[styles.pickupError, { color: theme.accent }]}>
                  {completion.error.message}
                </Text>
              ) : null}
              {/*
                Inside the `ready` gate on purpose, sharing one lifecycle with the
                button and the error text above. If a poll lands `completed` while
                this dialog is open (staff completed the order first), there is no
                longer anything to confirm — and leaving the dialog mounted would
                let the user confirm into a guaranteed 409 whose error text just
                unmounted with the block behind it. Being a Modal, it renders in
                its own window, so sitting inside the ScrollView costs no layout.
              */}
              <ConfirmDialog
                visible={confirmVisible}
                title="Got your order?"
                message="This closes your order and adds your Jojo Star. Only tap this once you have your food."
                confirmLabel="Yes, I got it"
                cancelLabel="Not yet"
                mode={mode}
                onConfirm={() => {
                  setConfirmVisible(false);
                  completion.mutate(orderId);
                }}
                onCancel={() => setConfirmVisible(false)}
              />
            </View>
          )}

          {/*
            B3 — customer self-cancel. Shown ONLY for `pending`, an equality check
            for the same reason as `ready` above: `pending` is the single status the
            server route accepts, so offering it any later just earns a 409. The
            reason is OPTIONAL here (unlike the staff reject), so the dialog can be
            submitted with nothing selected.

            SURFACE / THEMING: like the pickup block, this sits on the screen's own
            themed background, so it takes the DEVICE-SCHEME `mode` — do not copy
            the timeline's pinned `mode="light"` down here.
          */}
          {order.status === 'pending' && (
            <View style={styles.pickupAction}>
              <Button
                testID="cancel-order-button"
                label="Cancel order"
                variant="outline"
                mode={mode}
                loading={cancellation.isPending}
                onPress={() => setCancelVisible(true)}
              />
              {cancellation.error ? (
                <Text style={[styles.pickupError, { color: theme.accent }]}>
                  {cancellation.error.message}
                </Text>
              ) : null}
              {/*
                Inside the `pending` gate on purpose, sharing one lifecycle with the
                button above — identical rationale to the pickup ConfirmDialog: if a
                poll lands `accepted` while this is open, there is nothing left to
                cancel and confirming would earn a guaranteed 409.
              */}
              <ReasonDialog
                visible={cancelVisible}
                submitting={cancellation.isPending}
                mode={mode}
                title="Cancel this order?"
                message="You can cancel while the branch has not accepted it yet. Telling us why is optional."
                reasons={CUSTOMER_CANCEL_REASONS}
                submitLabel="Cancel order"
                submittingLabel="Cancelling…"
                cancelLabel="Keep order"
                testIDPrefix="cancel-order"
                onCancel={() => setCancelVisible(false)}
                onSubmit={(reasonCode, note) => {
                  setCancelVisible(false);
                  cancellation.mutate({ orderId, reasonCode, note });
                }}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
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
  pickupAction: { gap: Spacing.two },
  pickupError: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  /*
    Terminal-reason block. Unlike `timelineCard` below, this does NOT pin a cream
    surface — it reads `theme` tokens so it is legible in both schemes, which is
    why its text uses the device-scheme `theme` rather than `Colors.light`.
  */
  reasonCard: {
    borderWidth: 2,
    borderRadius: 16,
    borderColor: Palette.jred,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  reasonHeading: {
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.bodySmall,
  },
  reasonLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  reasonNote: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
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
    backgroundColor: Palette.green,
  },
  text: {
    fontFamily: FontFamily.body.bold,
    fontSize: 11,
    color: Palette.green,
    letterSpacing: 0.8,
  },
});
