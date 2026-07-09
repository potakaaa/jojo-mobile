import { ComingSoon } from '@/components/coming-soon';

/**
 * Order History (nested Order screen). Also linked from the Account tab via
 * `router.push('/(tabs)/order/history')` — the route lives here only (Expo
 * Router cannot register one screen in two places).
 */
export default function OrderHistoryScreen() {
  return <ComingSoon title="Order History" isNestedScreen />;
}
