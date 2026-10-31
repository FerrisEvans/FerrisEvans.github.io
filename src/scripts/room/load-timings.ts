export type LoadTimingMeta = Record<string, string | number | boolean | null | undefined>;
export type LoadTimingOutcome = 'ok' | 'error' | 'aborted';
export type LoadTimingEntry = {
  id: number;
  name: string;
  kind: 'span' | 'mark';
  startMs: number;
  endMs?: number;
  durationMs?: number;
  outcome: LoadTimingOutcome | 'pending';
  meta: LoadTimingMeta;
};
export type EndLoadTiming = (outcome?: LoadTimingOutcome, meta?: LoadTimingMeta) => void;
export type RoomLoadTimings = ReturnType<typeof createLoadTimings>;

/** Per-mount CPU/wall-clock observations; no GPU waits or resource retention. */
export function createLoadTimings(options: {now?: () => number; limit?: number} = {}) {
  const now = options.now ?? (() => performance.now());
  const startedAtMs = now();
  const requestedLimit = options.limit ?? 1024;
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.floor(requestedLimit)) : 1024;
  const entries: LoadTimingEntry[] = [];
  let nextId = 0, droppedEntries = 0;
  const elapsed = () => Math.max(0, now() - startedAtMs);
  const add = (name: string, kind: LoadTimingEntry['kind'], meta: LoadTimingMeta) => {
    if (entries.length >= limit) { droppedEntries++; return; }
    const entry: LoadTimingEntry = {id: ++nextId, name, kind, startMs: elapsed(), outcome: 'pending', meta: {...meta}};
    entries.push(entry);
    return entry;
  };
  return {
    start(name: string, meta: LoadTimingMeta = {}): EndLoadTiming {
      const entry = add(name, 'span', meta);
      return (outcome = 'ok', extra = {}) => {
        if (!entry || entry.outcome !== 'pending') return;
        entry.endMs = Math.max(entry.startMs, elapsed());
        entry.durationMs = Math.max(0, entry.endMs - entry.startMs);
        entry.outcome = outcome;
        Object.assign(entry.meta, extra);
      };
    },
    mark(name: string, meta: LoadTimingMeta = {}) {
      const entry = add(name, 'mark', meta);
      if (entry) { entry.endMs = entry.startMs; entry.durationMs = 0; entry.outcome = 'ok'; }
    },
    snapshot() {
      return {version: 1, startedAtMs, elapsedMs: elapsed(), droppedEntries,
        entries: entries.map(entry => ({...entry, meta: {...entry.meta}}))};
    },
  };
}
