import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data on mount (and when deps change); `reload` refetches, `set` edits locally. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(load);
  latest.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await latest.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);

  return { data, error, loading, reload, set: setData };
}
