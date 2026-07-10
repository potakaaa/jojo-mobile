import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface SelectedBranchContextValue {
  selectedBranchId: string | null;
  setSelectedBranch: (id: string | null) => void;
}

const SelectedBranchContext = createContext<SelectedBranchContextValue | null>(null);

export function SelectedBranchProvider({ children }: { children: ReactNode }) {
  const [selectedBranchId, setSelectedBranch] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedBranchId, setSelectedBranch }), [selectedBranchId]);
  return createElement(SelectedBranchContext.Provider, { value }, children);
}

export function useSelectedBranch(): SelectedBranchContextValue {
  const ctx = useContext(SelectedBranchContext);
  if (!ctx) throw new Error('useSelectedBranch must be used within a SelectedBranchProvider');
  return ctx;
}
