import { router } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';

/**
 * Coupons (nested Rewards screen). `onBack` makes ComingSoon render the shared
 * `<ScreenHeader>` — this stack runs `headerShown:false` (NAV-003), so this is
 * the screen's only way back.
 */
export default function CouponsScreen() {
  return <ComingSoon title="Coupons" isNestedScreen onBack={() => router.back()} />;
}
