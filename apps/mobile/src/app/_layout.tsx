import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { CartSessionProvider } from '@/features/cart/hooks/use-cart';
import { OrderSessionProvider } from '@/features/order/hooks/use-order';
import { AuthProvider, useAuth } from '@/features/auth/hooks/use-auth';

// Keep the splash screen visible until the brand fonts are ready, so the app
// never flashes system fonts before Fredoka / Plus Jakarta Sans load.
SplashScreen.preventAutoHideAsync();

/**
 * Reads the real better-auth session seam and gates the authenticated `(tabs)`
 * shell against the public `(auth)` stack. Uses `Stack.Protected` guards
 * (stable in the installed `expo-router` version) so only the matching group is
 * mounted; navigation between groups is driven purely by the session becoming
 * (un)authenticated. While the persisted session is still being restored
 * (`isLoading`), keep the user in the public stack — the in-stack Splash screen
 * covers the brief cold-start beat.
 */
function RootNavigator() {
  const { user, isLoading } = useAuth();
  const isAuthenticated = !isLoading && user !== null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <CartSessionProvider>
          <OrderSessionProvider>
            <RootNavigator />
          </OrderSessionProvider>
        </CartSessionProvider>
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
