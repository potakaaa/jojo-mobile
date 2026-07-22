import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (ADM-010 search box). Returns the input value
 * only after it has stopped changing for `delayMs`. Deliberately a tiny hand-rolled
 * hook — no debounce library, and NOT `useDeferredValue` (which defers render
 * priority, not the network-request timing, which is what the search box needs).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
