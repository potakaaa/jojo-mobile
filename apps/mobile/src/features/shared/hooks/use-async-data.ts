import { useCallback, useEffect, useState } from 'react';

export interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Manually re-run the fetch (e.g. a retry button). */
  refetch: () => void;
}

/**
 * Minimal fetch-on-mount data hook: runs `fetcher` whenever `deps` change and
 * exposes `{ data, loading, error, refetch }`. A mounted-guard prevents setState
 * after unmount.
 *
 * Pass a `fetcher` that is stable across renders (wrap in `useCallback`) so the
 * effect does not loop.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcher();
        if (active) setData(result);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { data, loading, error, refetch };
}
