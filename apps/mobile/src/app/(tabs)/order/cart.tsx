import type { CartItem as CartItemData, MenuItem } from '@jojopotato/types';
import { Button, CartItem } from '@jojopotato/ui';
import { formatCurrency } from '@jojopotato/utils';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Spacing, TypeScale } from '@/constants/theme';
import { cartSubtotalCents } from '@/features/cart/lib/cart-totals';
import { useCart, type CartLine } from '@/features/cart/hooks/use-cart';
import { ScreenMessage } from '@/features/shared/components/screen-message';
import { useTheme } from '@/hooks/use-theme';

/** A cart line already folds its option deltas into `unitPriceCents`, so the
 *  reused `CartItem` gets a synthetic product priced at that unit price. */
function toProduct(line: CartLine): MenuItem {
  return {
    id: line.productId,
    name: line.name,
    priceCents: line.unitPriceCents,
    categoryId: '',
    isAvailable: true,
  };
}

function toCartItemData(line: CartLine): CartItemData {
  return {
    lineId: line.lineId,
    menuItemId: line.productId,
    quantity: line.quantity,
    selectedOptions: line.selectedOptions,
  };
}

function optionSummary(line: CartLine): string | undefined {
  const parts = line.selectedOptions.map((o) => o.name);
  return parts.length > 0 ? parts.join(' • ') : undefined;
}

/** Cart review: line rows with quantity steppers, a subtotal, and checkout. */
export default function CartScreen() {
  const theme = useTheme();
  const { items, updateQuantity } = useCart();

  if (items.length === 0) {
    return (
      <ScreenMessage
        title="Your cart is empty"
        subtitle="Browse a branch menu to add something tasty."
        actionLabel="Browse branches"
        onAction={() => router.replace('/(tabs)/branches')}
      />
    );
  }

  const subtotalCents = cartSubtotalCents(items);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.map((line) => (
          <CartItem
            key={line.lineId}
            item={toCartItemData(line)}
            product={toProduct(line)}
            flavor={optionSummary(line)}
            onIncrement={() => updateQuantity(line.lineId, line.quantity + 1)}
            onDecrement={() => updateQuantity(line.lineId, line.quantity - 1)}
          />
        ))}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <View style={styles.subtotalRow}>
          <Text style={[styles.subtotalLabel, { color: theme.textSecondary }]}>Subtotal</Text>
          <Text style={[styles.subtotalValue, { color: theme.text }]}>
            {formatCurrency(subtotalCents)}
          </Text>
        </View>
        <Button label="Checkout" onPress={() => router.push('/(tabs)/order/checkout')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  footer: { padding: Spacing.four, gap: Spacing.three, borderTopWidth: 2 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtotalLabel: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.body },
  subtotalValue: { fontFamily: FontFamily.body.bold, fontSize: TypeScale.h3 },
});
