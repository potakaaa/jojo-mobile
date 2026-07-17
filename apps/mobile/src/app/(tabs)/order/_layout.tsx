import { Stack } from 'expo-router';

/**
 * Order tab nested stack. The tab-root (`index`) keeps `headerShown:false`
 * (it is framed by the tab bar).
 *
 * Every pushed screen ALSO runs `headerShown:false` (NAV-003): the native title
 * bar is replaced by the shared in-content `<ScreenHeader>` from `@jojopotato/ui`,
 * the same header the `(staff)` and `notifications` screens use — a custom control
 * injected into the native `headerLeft` slot cannot be given the right gap/inset
 * from the outside, so the header is rendered in content instead. Each screen
 * therefore owns its own top safe-area inset (`<SafeAreaView edges={['top', ...]}>`)
 * and renders its own title + back control.
 *
 * The former per-screen `title` options are gone: they only configured the native
 * header, which no longer renders. Titles now live in each screen's `<ScreenHeader>`.
 * The iOS edge-swipe-back gesture is unaffected — `gestureEnabled` is an independent
 * screen option that `headerShown` never touches (verified against installed
 * expo-router 57.0.4 `NativeStackView.native.js`).
 */
export default function OrderStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="product/[productId]" options={{ headerShown: false }} />
      <Stack.Screen name="cart" options={{ headerShown: false }} />
      <Stack.Screen name="checkout" options={{ headerShown: false }} />
      <Stack.Screen name="payment-method" options={{ headerShown: false }} />
      <Stack.Screen name="confirmation/[orderId]" options={{ headerShown: false }} />
      <Stack.Screen name="tracking/[orderId]" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ headerShown: false }} />
    </Stack>
  );
}
