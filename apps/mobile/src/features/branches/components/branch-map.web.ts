import type { PickupBranch } from '@jojopotato/types';
import { forwardRef } from 'react';
import type React from 'react';

/**
 * Web stub for BranchMap. expo-maps has no web implementation, so the Branches
 * screen shows list-only on web (the toggle is also hidden there via a
 * `Platform.OS !== 'web'` guard in index.tsx). Metro resolves this `.web.ts`
 * file on web builds instead of `branch-map.tsx`, so expo-maps is never imported
 * into the web bundle.
 *
 * Signature mirrors the native component exactly — same props AND the same
 * `BranchMapHandle` ref API via forwardRef — so the shared import in index.tsx
 * (which passes a ref) stays type-safe and a true drop-in on every platform.
 */

export interface BranchMapProps {
  branches: PickupBranch[];
  coords: { latitude: number; longitude: number } | null;
  onBranchPress: (branchId: string) => void;
}

export interface BranchMapHandle {
  focusOn: (coords: { latitude: number; longitude: number }, zoom?: number) => void;
}

export const BranchMap = forwardRef<BranchMapHandle, BranchMapProps>(
  function BranchMap(): React.ReactElement | null {
    return null;
  },
);
