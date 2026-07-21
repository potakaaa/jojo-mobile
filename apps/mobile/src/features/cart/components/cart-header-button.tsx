import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Palette, Radii, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';

/**
 * Trailing header action: a cart icon that navigates to the cart page, with a
 * live item-count badge. Designed to sit in `ScreenHeader`'s `right` slot.
 * Reads the count straight from `useCart()` so it stays in sync everywhere it
 * is mounted.
 */
export function CartHeaderButton() {
  const theme = useTheme();
  const { cart } = useCart();
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/cart')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `View cart, ${count} item${count === 1 ? '' : 's'}` : 'View cart'
      }
      style={styles.button}
    >
      <Ionicons name="cart-outline" size={26} color={theme.text} />
      {count > 0 ? (
        <View
          style={[styles.badge, { backgroundColor: Palette.jred, borderColor: theme.background }]}
        >
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: Radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    // Sits on the fixed jred badge in both schemes — cream reads in both.
    fontFamily: FontFamily.body.bold,
    fontSize: TypeScale.caption - 2,
    lineHeight: TypeScale.caption,
    color: Palette.cream,
  },
});
