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
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, useColorScheme, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/features/auth/hooks/use-auth';
import { BranchProvider } from '@/features/branch/hooks/use-branch';
import { CartSessionProvider } from '@/features/cart/hooks/use-cart';
import { queryClient } from '@/lib/query-client';

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
  const { user, isLoading, isStaff, hasCompletedProfile } = useAuth();
  const isAuthenticated = !isLoading && user !== null;
  const isStaffUser = isAuthenticated && isStaff;
  const isCustomer = isAuthenticated && !isStaff;

  // Four mutually-exclusive gates so exactly one group mounts:
  //   staff/admin/super_admin            → (staff)        [checked FIRST — staff skip the
  //                                                        customer profile onboarding entirely]
  //   customer + profile complete        → (tabs)
  //   customer + profile incomplete      → (onboarding)   [post-auth account onboarding]
  //   unauthenticated                    → (auth)         [public/pre-auth welcome]
  // `isLoading` keeps the user in the public stack (the in-stack Splash covers cold start).
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isStaffUser}>
        <Stack.Screen name="(staff)" />
      </Stack.Protected>
      <Stack.Protected guard={isCustomer && hasCompletedProfile}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={isCustomer && !hasCompletedProfile}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function AuthedTree() {
  const { user } = useAuth();

  return (
    <BranchProvider>
      <CartSessionProvider key={user?.id ?? 'anonymous'}>
        <RootNavigator />
      </CartSessionProvider>
    </BranchProvider>
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

  // Bridge RN app foregrounding into TanStack Query's focus manager so
  // `refetchOnWindowFocus` (query-client.ts) actually refetches on native.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthedTree />
          </AuthProvider>
        </QueryClientProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
