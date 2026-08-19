import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";

// Local ambient declaration rather than pulling in @types/node (would bring
// in a full Node global surface that isn't accurate for the RN/Metro runtime
// this actually runs in) — require() itself works fine under CommonJS either way.
declare function require(id: string): unknown;

export interface AsyncStorageLike {
  getItem: (...args: unknown[]) => Promise<unknown>;
  setItem: (...args: unknown[]) => Promise<unknown>;
  removeItem: (...args: unknown[]) => Promise<unknown>;
  mergeItem?: (...args: unknown[]) => Promise<unknown>;
  clear: (...args: unknown[]) => Promise<unknown>;
  multiGet?: (...args: unknown[]) => Promise<unknown>;
  multiSet?: (...args: unknown[]) => Promise<unknown>;
  multiRemove?: (...args: unknown[]) => Promise<unknown>;
}

const METHODS = ["getItem", "setItem", "removeItem", "mergeItem", "clear", "multiGet", "multiSet", "multiRemove"] as const;
type MethodName = (typeof METHODS)[number];

/** Best-effort: only patches if `@react-native-async-storage/async-storage` resolves. */
export const storageCapture: Capture = {
  name: "storage",
  install(emit: Emit) {
    const storage = resolveAsyncStorage();
    if (!storage) return () => {};
    return patchAsyncStorage(storage, emit);
  },
};

/** Extracted so it's testable with a fake storage object, without mocking `require`. */
export function patchAsyncStorage(storage: AsyncStorageLike, emit: Emit): () => void {
  const target = storage as unknown as Record<string, unknown>;
  const originals: Partial<Record<MethodName, (...args: unknown[]) => unknown>> = {};

  for (const method of METHODS) {
    const original = target[method];
    if (typeof original !== "function") continue;
    originals[method] = original as (...args: unknown[]) => unknown;

    target[method] = (...args: unknown[]) => {
      const start = Date.now();
      const result = (original as (...a: unknown[]) => unknown).apply(storage, args);
      if (result instanceof Promise) {
        result
          .then((value) => emitStorageEvent(emit, method, args, start, value))
          .catch((error) => emitStorageEvent(emit, method, args, start, undefined, error));
      }
      return result;
    };
  }

  return () => {
    for (const method of METHODS) {
      const original = originals[method];
      if (original) target[method] = original;
    }
  };
}

function emitStorageEvent(
  emit: Emit,
  method: MethodName,
  args: unknown[],
  start: number,
  value?: unknown,
  error?: unknown,
): void {
  const key = typeof args[0] === "string" || Array.isArray(args[0]) ? (args[0] as string | string[]) : undefined;
  safeEmit(emit, {
    id: generateId(),
    timestamp: start,
    category: "storage",
    label: `${method}${key !== undefined ? ` ${describeKey(key)}` : ""}${error ? " failed" : ""}`,
    durationMs: Date.now() - start,
    data: { method, key, value: error ? undefined : value, error: error ? String(error) : undefined },
  });
}

function describeKey(key: string | string[]): string {
  return Array.isArray(key) ? `[${key.length} keys]` : key;
}

function resolveAsyncStorage(): AsyncStorageLike | null {
  try {
    const mod = require("@react-native-async-storage/async-storage") as { default?: AsyncStorageLike } | AsyncStorageLike;
    const candidate = (mod as { default?: AsyncStorageLike }).default ?? (mod as AsyncStorageLike);
    if (candidate && typeof candidate.getItem === "function") return candidate;
  } catch {
    // package not installed — fall through, storage capture just won't apply
  }
  return null;
}
