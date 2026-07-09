import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { FontFamily, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Cart (nested Order screen). Placeholder with a dev link onward to Checkout. */
export default function CartScreen() {
  const theme = useTheme();

  return (
    <ComingSoon title="Cart" isNestedScreen>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/order/checkout')}>
        <Text style={[styles.link, { color: theme.accent }]}>Dev: Go to Checkout</Text>
      </Pressable>
    </ComingSoon>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: FontFamily.body.semibold, fontSize: TypeScale.bodySmall },
});
