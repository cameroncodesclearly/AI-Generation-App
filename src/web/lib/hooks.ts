import { useCallback, useEffect, useRef, useState } from "react";

/** Poll a loader while `active` is true. */
export function usePoll<T>(loader: () => Promise<T>, intervalMs: number, active: boolean, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);
  const run = useCallback(async () => {
    try { setData(await loader()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void run();
    if (!active) return;
    timer.current = window.setInterval(() => void run(), intervalMs);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [run, active, intervalMs]);
  return { data, error, loading, reload: run, setData };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useCopy(): [string | null, (text: string, id?: string) => Promise<void>] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string, id = "x") => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  }, []);
  return [copied, copy];
}
