import type { PickupBranch } from '@jojopotato/types';
import type { ThemeMode } from '@jojopotato/ui';
import type React from 'react';

/**
 * Web stub for BranchMap. expo-maps has no web implementation, so the Branches
 * screen shows list-only on web (the toggle is also hidden there via a
 * `Platform.OS !== 'web'` guard in index.tsx). Metro resolves this `.web.ts`
 * file on web builds instead of `branch-map.tsx`, so expo-maps is never imported
 * into the web bundle.
 *
 * Signature mirrors the native component exactly so the shared import in
 * index.tsx stays type-safe on every platform.
 */

export interface BranchMapProps {
  branches: PickupBranch[];
  coords: { latitude: number; longitude: number } | null;
  onBranchPress: (branchId: string) => void;
  mode?: ThemeMode;
}

export function BranchMap(_props: BranchMapProps): React.ReactElement | null {
  return null;
}
