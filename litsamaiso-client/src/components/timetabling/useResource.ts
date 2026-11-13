import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';

// Loads data when `fetch` changes (memoize it with useCallback) and again on reload().
// `loading` stays true until the data on hand came from the current `fetch`, so a page
// never mistakes the previous semester's data for this one's.
export const useResource = <T>(fetch: () => Promise<T>, initial: T, errorMessage: string) => {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ data: T; source: unknown; version: number }>({ data: initial, source: null, version: -1 });

  useEffect(() => {
    let cancelled = false;
    fetch()
      .then((data) => { if (!cancelled) setState({ data, source: fetch, version }); })
      .catch((error) => {
        if (cancelled) return;
        toast.error(getApiErrorMessage(error, errorMessage));
        setState((current) => ({ ...current, source: fetch, version }));
      });
    return () => { cancelled = true; };
  }, [fetch, version, errorMessage]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { data: state.data, loading: state.source !== fetch || state.version !== version, reload };
};
