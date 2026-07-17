import { router } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';

/**
 * Help (nested Account screen). `onBack` makes ComingSoon render the shared
 * `<ScreenHeader>` — this stack runs `headerShown:false` (NAV-003), so this is
 * the screen's only way back.
 */
export default function HelpScreen() {
  return <ComingSoon title="Help" isNestedScreen onBack={() => router.back()} />;
}
