import type { PaymentMethod } from '@jojopotato/types';
import { formatCurrency } from '@jojopotato/utils';
import { Button, CartSummary, EmptyState } from '@jojopotato/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MOCK_CART_BRANCH, MOCK_OTHER_BRANCH } from '@/features/cart/mock-cart';
import { useOrder } from '@/features/order/hooks/use-order';
import { FontFamily, MaxContentWidth, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const BRANCH_NAMES: Record<string, string> = {
  [MOCK_CART_BRANCH.id]: MOCK_CART_BRANCH.name,
  [MOCK_OTHER_BRANCH.id]: MOCK_OTHER_BRANCH.name,
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pay_at_branch: 'Pay at pickup',
  online_payment: 'Online payment',
};

function pickupLabel(iso: string): string {
  const ready = new Date(iso);
  const label = ready.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return `Ready ~ ${label}`;
}

/**
 * Order Confirmation screen (CART-002). Renders the just-placed order held in
 * the in-memory `useOrder().lastOrder` seam; the `orderId` route param is used
 * only as a display/direct-link fallback when no live order is available (e.g.
 * a cold deep-link), since there is no order backend to re-fetch from yet.
 */
export default function OrderConfirmationScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { lastOrder } = useOrder();

  const order = lastOrder;

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <EmptyState
            iconName="receipt-outline"
            title={`Order ${orderId}`}
            description="We don't have the details for this order in this session. Order history is coming soon."
            actionLabel="Back to menu"
            onAction={() => router.replace('/(tabs)/order')}
            mode={mode}
          />
        </SafeAreaView>
      </View>
    );
  }

  const branchName = BRANCH_NAMES[order.branchId] ?? order.branchId;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
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
            <Row
              label="Estimated pickup"
              value={pickupLabel(order.estimatedReadyAt)}
              theme={theme}
            />
            <Row label="Payment" value={PAYMENT_LABEL[order.paymentMethod]} theme={theme} />
          </View>

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
            label="Back to menu"
            onPress={() => router.replace('/(tabs)/order')}
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
  },
});
