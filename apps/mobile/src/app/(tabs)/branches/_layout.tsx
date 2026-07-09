import { Stack } from 'expo-router';

/** Branches tab nested stack. Root (Branch Locator) headerless; details pushed. */
export default function BranchesStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[branchId]" options={{ title: 'Branch Details' }} />
    </Stack>
  );
}
