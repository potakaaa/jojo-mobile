import type { PaymentMethod } from '@jojopotato/types';
import { PaymentMethodSelector, ScreenHeader } from '@jojopotato/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { env } from '@/config/env';
import { useOrder } from '@/features/order/hooks/use-order';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Payment-method selection screen. Renders the shared `PaymentMethodSelector`
 * (5 concrete methods, availability gated per D2). Selecting an available method
 * applies it via `useOrder()` and pops back to Checkout. Disabled rows can't fire
 * `onChange` (the selector's `Pressable` is `disabled`), so no extra guard here.
 */
export default function PaymentMethodScreen() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const { paymentMethod, setPaymentMethod } = useOrder();

  const handleSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/*
        'top' is ADDED (NAV-003): this stack now runs `headerShown:false`, so the
        top inset is ours to supply or the ScreenHeader would sit under the status
        bar. 'bottom' is KEPT — unlike cart/checkout, this screen has NO
        resolveTabBarClearance call, so this SafeAreaView is its ONLY source of
        the device bottom inset. Dropping it would count the inset zero times.
      */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="Payment Method" onBack={() => router.back()} mode={mode} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <PaymentMethodSelector
            value={paymentMethod}
            onChange={handleSelect}
            onlinePaymentEnabled={env.onlinePaymentEnabled}
            mode={mode}
          />
        </ScrollView>
      </SafeAreaView>
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
});
