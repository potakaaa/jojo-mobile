import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Order tab root. Placeholder until the real menu/ordering UI lands. Temporary,
 * clearly-labeled dev nav links let the nested Order stack (Product Details →
 * Cart → Checkout, etc.) be tapped through manually — remove once real UI ships.
 */
export default function OrderScreen() {
  const theme = useTheme();

  return (
    <ComingSoon title="Order">
      <DevLink
        label="Dev: View Product 123"
        onPress={() =>
          router.push({
            pathname: '/(tabs)/order/product/[productId]',
            params: { productId: '123' },
          })
        }
        color={theme.accent}
      />
      <DevLink
        label="Dev: View Cart"
        onPress={() => router.push('/(tabs)/order/cart')}
        color={theme.accent}
      />
      <DevLink
        label="Dev: Order History"
        onPress={() => router.push('/(tabs)/order/history')}
        color={theme.accent}
      />
    </ComingSoon>
  );
}

function DevLink({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={[styles.link, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
