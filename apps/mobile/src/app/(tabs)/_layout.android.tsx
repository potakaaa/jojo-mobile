import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import FloatingTabBar from '@/components/floating-tab-bar';

/**
 * Android tab navigator using the stable `expo-router` `Tabs` with the shared,
 * brand-styled `tabBar` (the floating jyellow pill bar) — the same one iOS
 * uses. Metro auto-resolves this over the non-suffixed layout on Android
 * builds (same platform-extension convention as `_layout.ios.tsx` /
 * `_layout.web.tsx`).
 *
 * `tabBarIcon` render props stay on each `Tabs.Screen` so
 * `descriptors[route.key].options` is a complete, self-describing source of
 * truth per screen, even though `FloatingTabBar` renders icons itself.
 */
export default function TabsAndroidLayout() {
  return (
    <Tabs
      // `backBehavior` defaults to `'firstRoute'`, which makes a GO_BACK from any
      // tab-sibling route (e.g. `/(tabs)/notifications`, `/(tabs)/deals`) return to
      // the FIRST registered tab — `index` (Home) — rather than the tab the user
      // actually came from. `'history'` tracks the real visited-route order, so back
      // returns to the calling tab (open Notifications from Account -> back = Account).
      // Also governs the Android hardware back button.
      backBehavior="history"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: 'Order',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'bag' : 'bag-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'star' : 'star-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="branches"
        options={{
          title: 'Branches',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'location' : 'location-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
