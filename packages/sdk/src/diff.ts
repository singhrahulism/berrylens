export interface DiffEntry {
  from: unknown;
  to: unknown;
}

/**
 * Per-key old→new pairs, not just which keys changed — this is what makes a
 * real diff view possible (old value alongside the new one) instead of just
 * "something changed, go compare two full snapshots yourself". Shared by the
 * Redux and Zustand adapters — both attach to something with a clear
 * before/after state pair.
 */
export function buildDiff(state: unknown, prevState: unknown): Record<string, DiffEntry> {
  if (typeof state !== "object" || state === null || typeof prevState !== "object" || prevState === null) return {};
  const keys = new Set([...Object.keys(state as object), ...Object.keys(prevState as object)]);
  const diff: Record<string, DiffEntry> = {};
  for (const key of keys) {
    const before = (prevState as Record<string, unknown>)[key];
    const after = (state as Record<string, unknown>)[key];
    if (before !== after) {
      diff[key] = { from: safeSnapshot(before), to: safeSnapshot(after) };
    }
  }
  return diff;
}

export function safeSnapshot(state: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return undefined;
  }
}
