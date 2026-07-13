import type { PickupBranch } from '@jojopotato/types';
import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getBranches } from '@/lib/api-client';

/** Persist key for the customer's chosen pickup branch. */
const STORAGE_KEY = 'jojopotato.selectedBranchId';

export interface BranchContextValue {
  /** The active selected branch, or null until branches have loaded. */
  selectedBranch: PickupBranch | null;
  setSelectedBranch: (branch: PickupBranch) => void;
  /** Active branches available to pick from. */
  branches: PickupBranch[];
  isLoading: boolean;
  /** Whether the branches request failed. */
  isError: boolean;
  /** Retry the branches request. */
  refetch: () => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

/** Branches currently available for pickup. */
function openOnly(branches: PickupBranch[]): PickupBranch[] {
  return branches.filter((branch) => branch.isOpen);
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const {
    data: branches = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore the persisted branch id on cold start.
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((id) => {
        if (!cancelled) setSelectedBranchId(id);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedBranch = useCallback((branch: PickupBranch) => {
    setSelectedBranchId(branch.id);
    void SecureStore.setItemAsync(STORAGE_KEY, branch.id);
  }, []);

  const value = useMemo<BranchContextValue>(() => {
    const active = openOnly(branches);
    // Resolve the persisted id against the live list; fall back to first active.
    const persisted = active.find((branch) => branch.id === selectedBranchId);
    const selectedBranch = persisted ?? active[0] ?? null;
    return {
      selectedBranch,
      setSelectedBranch,
      branches: active,
      isLoading: isPending || !hydrated,
      isError,
      refetch: () => void refetch(),
    };
  }, [branches, selectedBranchId, hydrated, isPending, isError, refetch, setSelectedBranch]);

  return createElement(BranchContext.Provider, { value }, children);
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return ctx;
}
