import { useLocalSearchParams } from 'expo-router';

import { ComingSoon } from '@/components/coming-soon';

/** Branch Details (nested Branches screen). Reads the typed `branchId` param. */
export default function BranchDetailsScreen() {
  const { branchId } = useLocalSearchParams<{ branchId: string }>();

  return <ComingSoon title={`Branch ${branchId}`} isNestedScreen />;
}
