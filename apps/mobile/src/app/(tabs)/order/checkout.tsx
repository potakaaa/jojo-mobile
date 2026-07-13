import type { PaymentMethod } from '@jojopotato/types';
import { Button, Card, PickupTimeBadge } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, Spacing, TypeScale } from '@/constants/theme';
import { useBranch } from '@/features/branches/hooks/use-branches';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useCheckout } from '@/features/orders/hooks/use-checkout';
import { ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/** Build a single "ready in ~N min" pickup slot from the branch prep time. */
function prepPickupTime(prepMinutes: number) {
  const ready = new Date(Date.now() + prepMinutes * 60_000);
  return {
    id: 'asap',
    label: `Ready in about ${prepMinutes} min`,
    isoTime: ready.toISOString(),
    isAvailable: true,
  };
}

/**
 * Checkout: pickup branch + time, payment method (only `pay_at_branch` is
 * selectable this pass), and Place order. The button disables itself while the
 * order request is in flight, so a double-tap can't fire two orders.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const { cart, subtotalCents, clearCart } = useCart();
  const branch = useBranch(cart.pickupBranchId);
  const { placeOrder, submitting, error } = useCheckout();
  const [paymentMethod] = useState<PaymentMethod>('pay_at_branch');

  if (cart.items.length === 0) {
    return (
      <ScreenMessage
        title="Nothing to check out"
        subtitle="Your cart is empty."
        actionLabel="Browse branches"
        onAction={() => router.replace('/(tabs)/branches')}
      />
    );
  }

  const onPlaceOrder = async () => {
    const order = await placeOrder({
      branchId: cart.pickupBranchId,
      paymentMethod,
      items: cart.items.map((item) => ({
        productId: item.menuItemId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions.map((o) => ({ optionId: o.id })),
      })),
    });
    if (order) {
      clearCart();
      router.replace({
        pathname: '/(tabs)/order/confirmation/[orderId]',
        params: { orderId: order.id },
      });
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Pickup from</Text>
        <Text style={[styles.branchName, { color: theme.text }]}>
          {branch.data?.name ?? 'Selected branch'}
        </Text>
        <PickupTimeBadge
          pickupTime={prepPickupTime(branch.data?.estimatedPrepMinutes ?? 20)}
          style={styles.badge}
        />
      </Card>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: true }}
          style={[
            styles.payRow,
            { borderColor: theme.accent, backgroundColor: Palette.creamTint2 },
          ]}
        >
          <Text style={[styles.payLabel, { color: theme.text }]}>Pay at branch</Text>
          <View
            style={[styles.radio, { borderColor: theme.accent, backgroundColor: theme.accent }]}
          />
        </Pressable>
        <View style={[styles.payRow, styles.payDisabled, { borderColor: theme.border }]}>
          <View>
            <Text style={[styles.payLabel, { color: theme.textSecondary }]}>Online payment</Text>
            <Text style={[styles.comingSoon, { color: theme.textSecondary }]}>Coming soon</Text>
          </View>
          <View style={[styles.radio, { borderColor: theme.border }]} />
        </View>
      </View>

      <View style={[styles.section, styles.totalRow]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Total</Text>
        <Text style={[styles.total, { color: theme.text }]}>{formatCurrency(subtotalCents)}</Text>
      </View>

      {error ? <Text style={[styles.error, { color: Palette.jred }]}>{error}</Text> : null}

      <Button
        label={submitting ? 'Placing order…' : 'Place order'}
        onPress={onPlaceOrder}
        loading={submitting}
        disabled={submitting}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  label: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.bodySmall },
  branchName: {
    fontFamily: FontFamily.display.bold,
    fontSize: TypeScale.h3,
    marginTop: Spacing.half,
  },
  badge: { marginTop: Spacing.two },
  section: { gap: Spacing.two },
  sectionTitle: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h3 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderRadius: Radii.md,
    padding: Spacing.three,
  },
  payDisabled: { opacity: 0.5 },
  payLabel: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.body },
  comingSoon: { fontFamily: FontFamily.body.medium, fontSize: TypeScale.caption, marginTop: 2 },
  radio: { width: 22, height: 22, borderWidth: 2, borderRadius: Radii.full },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.h2 },
  error: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
