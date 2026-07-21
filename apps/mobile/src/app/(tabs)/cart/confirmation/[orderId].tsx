import { formatCurrency } from '@jojopotato/utils';
import {
  Button,
  CartSummary,
  EmptyState,
  PAYMENT_METHOD_LABELS,
  ScreenHeader,
} from '@jojopotato/ui';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHideTabBarWhile } from '@/components/floating-tab-bar';
import { useBranch } from '@/features/branch/hooks/use-branch';
import { useOrder } from '@/features/orders/hooks/use-order';
import { useNavigateToOrderTracking } from '@/features/orders/lib/navigate-to-tracking';
import { FontFamily, MaxContentWidth, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

function pickupLabel(iso: string): string {
  const ready = new Date(iso);
  const label = ready.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `Ready ~ ${label}`;
}

/**
 * Order Confirmation screen (CART-002). Fetches the just-placed order from the
 * real `GET /orders/:orderId` endpoint via `useOrder(orderId)`, keyed off the
 * `orderId` route param (the server-assigned order id passed by Checkout). This
 * works both for the fresh-placement navigation and for a cold direct link,
 * with loading and error states in between. The pickup-branch name is resolved
 * from the live branch list.
 */
export default function OrderConfirmationScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { data: order, loading, error, refetch } = useOrder(orderId);
  const { branches } = useBranch();
  const navigateToOrderTracking = useNavigateToOrderTracking();

  /*
    Hide the floating tab bar on this screen — it lives in a top-level stack now
    (NAV-005), so `isNestedTabRoute()` is false and the bar would otherwise paint
    here. Gated on FOCUS, not just mount: the screen stays mounted in the Tabs
    navigator after the user navigates away (e.g. tapping "Track your order"
    pushes into another top-level stack), and an always-true flag would leave the
    bar hidden on the destination. See ../index.tsx for the full note.

    Placed ABOVE the loading / error early returns below: hooks must run in the
    same order on every render, so it cannot sit after a conditional return.
  */
  useHideTabBarWhile(useIsFocused());

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={[styles.safeArea, styles.center]} edges={['top', 'bottom']}>
          <ActivityIndicator color={Palette.jorange} />
        </SafeAreaView>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <EmptyState
            iconName="receipt-outline"
            title={`Order ${orderId}`}
            description={error ?? "We couldn't load the details for this order."}
            actionLabel={error ? 'Retry' : 'Back to menu'}
            onAction={error ? refetch : () => router.replace('/(tabs)/order')}
            mode={mode}
          />
        </SafeAreaView>
      </View>
    );
  }

  const branchName = branches.find((b) => b.id === order.branchId)?.name ?? order.branchId;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Order Confirmed" onBack={() => router.back()} mode={mode} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>Order confirmed</Text>
            <Text style={[styles.orderNumber, { color: theme.accent }]}>{order.orderNumber}</Text>
            <Text style={[styles.heroCaption, { color: theme.textSecondary }]}>
              Show this number at the counter when you pick up.
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <Row label="Pickup branch" value={branchName} theme={theme} />
            {order.estimatedReadyAt != null && (
              <Row
                label="Estimated pickup"
                value={pickupLabel(order.estimatedReadyAt)}
                theme={theme}
              />
            )}
            <Row label="Payment" value={PAYMENT_METHOD_LABELS[order.paymentMethod]} theme={theme} />
          </View>

          <Text style={[styles.payNote, { color: theme.textSecondary }]}>
            Pay when you pick up — settle your order in cash or card at the branch counter.
          </Text>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Items</Text>
            {order.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
                  {item.quantity}× {item.productNameSnapshot}
                </Text>
                <Text style={[styles.itemPrice, { color: theme.textSecondary }]}>
                  {formatCurrency(item.totalPriceCents)}
                </Text>
              </View>
            ))}
          </View>

          <CartSummary
            subtotalCents={order.subtotalCents}
            discountCents={order.discountTotalCents}
            totalCents={order.totalCents}
            mode={mode}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Track your order"
            onPress={() => navigateToOrderTracking(order.id)}
            mode={mode}
          />
          <Button
            label="View your Jojo Stars ★"
            onPress={() => router.replace('/(tabs)/rewards')}
            variant="outline"
            mode={mode}
          />
          <Button
            label="Back to menu"
            onPress={() => router.replace('/(tabs)/order')}
            variant="outline"
            mode={mode}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Row({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: { text: string; textSecondary: string };
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  heroTitle: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h1,
  },
  orderNumber: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.display,
  },
  heroCaption: {
    fontFamily: FontFamily.body.regular,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radii.md,
    borderWidth: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailLabel: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  payNote: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.bodySmall,
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  itemName: {
    flex: 1,
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  itemPrice: {
    fontFamily: FontFamily.body.semibold,
    fontSize: TypeScale.bodySmall,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
});
