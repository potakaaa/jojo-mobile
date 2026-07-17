import { Stack } from 'expo-router';

/**
 * Branches tab nested stack. Root (Branch Locator) headerless; details pushed.
 *
 * The pushed details screen also runs `headerShown:false` (NAV-003) — it renders
 * the shared in-content `<ScreenHeader>` and owns its own top safe-area inset.
 * See `../order/_layout.tsx` for the full rationale.
 */
export default function BranchesStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[branchId]" options={{ headerShown: false }} />
    </Stack>
  );
}
