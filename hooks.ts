import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { enabled?: boolean; pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(opts.enabled !== false);
  const fnRef = useRef(fn); fnRef.current = fn;
  const run = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { const d = await fnRef.current(); setData(d); setError(null); }
    catch (e) { setError((e as Error).message || 'Something went wrong.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (opts.enabled === false) { setLoading(false); return; }
    run();
    if (!opts.pollMs) return;
    const t = setInterval(() => { if (!document.hidden) run(true); }, opts.pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, opts.enabled]);
  return { data, error, loading, reload: () => run() };
}

export function usePrefersReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
}
