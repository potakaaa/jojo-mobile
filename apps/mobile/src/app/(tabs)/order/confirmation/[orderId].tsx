import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Order Confirmation (nested Order screen). Reads the typed `orderId` param and
 * offers a dev link onward to the tracking screen for the same order.
 */
export default function OrderConfirmationScreen() {
  const theme = useTheme();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  return (
    <ComingSoon title={`Order ${orderId} Confirmed`} isNestedScreen>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/(tabs)/order/tracking/[orderId]', params: { orderId } })
        }
      >
        <Text style={[styles.link, { color: theme.accent }]}>Dev: Track Order</Text>
      </Pressable>
    </ComingSoon>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
