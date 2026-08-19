import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";

interface QueryLike {
  queryKey: unknown;
  state: { status: string; error?: unknown; data?: unknown };
}

interface QueryCacheEventLike {
  type: string;
  query: QueryLike;
}

interface MutationLike {
  options?: { mutationKey?: unknown };
  state: { status: string; error?: unknown; data?: unknown };
}

interface MutationCacheEventLike {
  type: string;
  // some event variants (e.g. an observer's options updating) don't carry a mutation
  mutation?: MutationLike;
}

export interface QueryClientLike {
  getQueryCache: () => { subscribe: (cb: (event: QueryCacheEventLike) => void) => () => void };
  getMutationCache: () => { subscribe: (cb: (event: MutationCacheEventLike) => void) => () => void };
}

/** Subscribes to React Query's existing cache event streams — no per-query instrumentation. */
export function reactQueryAdapter(queryClient: QueryClientLike): Capture {
  return {
    name: "react-query",
    install(emit: Emit) {
      const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
        const { query } = event;
        safeEmit(emit, {
          id: generateId(),
          timestamp: Date.now(),
          category: "query",
          label: `${describeKey(query.queryKey)} ${query.state.status}`,
          data: {
            event: event.type,
            queryKey: query.queryKey,
            status: query.state.status,
            result: query.state.data,
            error: describeError(query.state.error),
          },
        });
      });

      const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
        const { mutation } = event;
        if (!mutation) return;
        safeEmit(emit, {
          id: generateId(),
          timestamp: Date.now(),
          category: "query",
          label: `mutation ${describeKey(mutation.options?.mutationKey)} ${mutation.state.status}`.trim(),
          data: {
            event: event.type,
            mutationKey: mutation.options?.mutationKey,
            status: mutation.state.status,
            result: mutation.state.data,
            error: describeError(mutation.state.error),
          },
        });
      });

      return () => {
        unsubQueries();
        unsubMutations();
      };
    },
  };
}

function describeKey(key: unknown): string {
  if (Array.isArray(key)) return key.map((part) => String(part)).join("/");
  return key === undefined ? "" : String(key);
}

function describeError(error: unknown): string | undefined {
  if (!error) return undefined;
  return error instanceof Error ? error.message : String(error);
}
