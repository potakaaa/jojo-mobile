import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import FloatingTabBar from '@/components/floating-tab-bar';

/**
 * iOS tab navigator using the stable `expo-router` `Tabs` with the shared,
 * brand-styled `tabBar` (the floating jyellow pill bar) — the same one
 * Android uses. Previously this used `expo-router/unstable-native-tabs`,
 * which renders the system Liquid Glass material on iOS 26+; that was
 * replaced so iOS matches the brand bar instead of the system look. Metro
 * auto-resolves this over the non-suffixed layout on iOS builds (same
 * platform-extension convention as `_layout.android.tsx` / `_layout.web.tsx`).
 *
 * `tabBarIcon` render props stay on each `Tabs.Screen` so
 * `descriptors[route.key].options` is a complete, self-describing source of
 * truth per screen, even though `FloatingTabBar` renders icons itself.
 */
export default function TabsIosLayout() {
  return (
    <Tabs
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
