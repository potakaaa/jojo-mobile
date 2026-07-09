import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Checkout (nested Order screen). Placeholder with a dev link that simulates
 * placing an order and lands on the confirmation screen.
 */
export default function CheckoutScreen() {
  const theme = useTheme();

  return (
    <ComingSoon title="Checkout" isNestedScreen>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: '/(tabs)/order/confirmation/[orderId]',
            params: { orderId: 'A1001' },
          })
        }
      >
        <Text style={[styles.link, { color: theme.accent }]}>Dev: Place Order</Text>
      </Pressable>
    </ComingSoon>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
