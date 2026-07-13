import { Button } from '@jojopotato/ui';
import { router } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFloatingTabBarClearance } from '@/components/floating-tab-bar';
import { FontFamily, MaxContentWidth, Spacing, TypeScale } from '@/constants/theme';
import { useCart } from '@/features/cart/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';

/**
 * Order tab root. Pickup ordering starts by choosing a branch, so this screen
 * points into the Branches flow, plus quick links to the current cart and past
 * orders.
 */
export default function OrderScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { itemCount } = useCart();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View
          style={[
            styles.content,
            Platform.OS !== 'web' && {
              paddingBottom: getFloatingTabBarClearance(insets.bottom),
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>Start an order</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Pick a branch to browse its menu and order for pickup.
          </Text>
          <Button label="Browse branches" onPress={() => router.push('/(tabs)/branches')} />
          <Button
            label={itemCount > 0 ? `View cart (${itemCount})` : 'View cart'}
            variant="outline"
            onPress={() => router.push('/(tabs)/order/cart')}
          />
          <Button
            label="Order history"
            variant="outline"
            onPress={() => router.push('/(tabs)/order/history')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: MaxContentWidth },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  title: { fontFamily: FontFamily.display.bold, fontSize: TypeScale.h1 },
  subtitle: {
    fontFamily: FontFamily.body.medium,
    fontSize: TypeScale.body,
    marginBottom: Spacing.two,
  },
});
