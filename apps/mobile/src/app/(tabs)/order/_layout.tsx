import { Stack } from 'expo-router';

/**
 * Order tab nested stack. The tab-root (`index`) keeps `headerShown:false`
 * (it is framed by the tab bar); every pushed screen gets the native header
 * with the default back button, so back-nav stays within the Order tab.
 */
export default function OrderStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="product/[productId]" options={{ title: 'Product Details' }} />
      <Stack.Screen name="cart" options={{ title: 'Cart' }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
      <Stack.Screen name="payment-method" options={{ title: 'Payment Method' }} />
      <Stack.Screen name="confirmation/[orderId]" options={{ title: 'Order Confirmed' }} />
      <Stack.Screen name="tracking/[orderId]" options={{ title: 'Order Tracking' }} />
      <Stack.Screen name="history" options={{ title: 'Order History' }} />
    </Stack>
  );
}
