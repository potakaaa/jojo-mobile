import type { ReorderUnavailableLine } from '@jojopotato/utils';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Ephemeral, out-of-band seam for reorder conflicts (DECISION 5).
 *
 * Now-unavailable items from a reorder must NEVER enter `cart.items` — every
 * cart line flows into `subtotalCents`/`totalCents` math and into checkout →
 * `POST /orders`, so an un-orderable line there would corrupt totals and could
 * reach placement. Instead they travel through this small context (mirroring the
 * `CartSessionProvider`/`BranchProvider` pattern) and are rendered as a notice in
 * the cart screen. This keeps the locked `Cart`/`CartItem` contract untouched.
 *
 * State is in-memory only (same lifetime as the cart itself, by design — a
 * force-quit mid-reorder clears it).
 */
export interface ReorderConflictState {
  conflicts: ReorderUnavailableLine[];
  setConflicts: (lines: ReorderUnavailableLine[]) => void;
  clearConflicts: () => void;
}

const ReorderConflictContext = createContext<ReorderConflictState | null>(null);

export function ReorderConflictProvider({ children }: { children: ReactNode }) {
  const [conflicts, setConflictsState] = useState<ReorderUnavailableLine[]>([]);

  const setConflicts = useCallback((lines: ReorderUnavailableLine[]) => {
    setConflictsState(lines);
  }, []);

  const clearConflicts = useCallback(() => {
    setConflictsState([]);
  }, []);

  const value = useMemo<ReorderConflictState>(
    () => ({ conflicts, setConflicts, clearConflicts }),
    [conflicts, setConflicts, clearConflicts],
  );

  return createElement(ReorderConflictContext.Provider, { value }, children);
}

export function useReorderConflicts(): ReorderConflictState {
  const ctx = useContext(ReorderConflictContext);
  if (!ctx) {
    throw new Error('useReorderConflicts must be used within a ReorderConflictProvider');
  }
  return ctx;
}
