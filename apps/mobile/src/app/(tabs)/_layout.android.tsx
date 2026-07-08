import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import AndroidTabBar from '@/components/android-tab-bar';

/**
 * Android tab navigator using the stable `expo-router` `Tabs` with a fully
 * custom, brand-styled `tabBar` (the floating jyellow pill bar). Metro
 * auto-resolves this over the non-suffixed layout on Android builds (same
 * platform-extension convention as `_layout.ios.tsx` / `_layout.web.tsx`).
 *
 * `tabBarIcon` render props stay on each `Tabs.Screen` so
 * `descriptors[route.key].options` is a complete, self-describing source of
 * truth per screen, even though `AndroidTabBar` renders icons itself.
 */
export default function TabsAndroidLayout() {
  return (
    <Tabs
      tabBar={(props) => <AndroidTabBar {...props} />}
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
