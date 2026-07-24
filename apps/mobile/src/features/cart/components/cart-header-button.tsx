import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@jojopotato/ui';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Trailing header action: a cart icon that navigates to the cart page, with a
 * live item-count badge. Designed to sit in `ScreenHeader`'s `right` slot.
 * This is the ONE cart-badge implementation — every screen mounts this rather
 * than hand-rolling its own icon/badge pair, so the color and the count source
 * (`useCart().itemCount`) can never drift between screens.
 */
export function CartHeaderButton() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const { itemCount } = useCart();

  return (
    <Pressable
      onPress={() => router.push('/(tabs)/cart')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        itemCount > 0 ? `View cart, ${itemCount} item${itemCount === 1 ? '' : 's'}` : 'View cart'
      }
      style={styles.button}
    >
      <Ionicons name="cart-outline" size={24} color={theme.text} />
      {itemCount > 0 ? (
        <Badge
          label={itemCount > 99 ? '99+' : String(itemCount)}
          variant="danger"
          mode={mode}
          style={styles.badge}
        />
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
    top: -Spacing.two,
    left: Spacing.three,
    paddingVertical: 0,
    paddingHorizontal: Spacing.one,
  },
});
