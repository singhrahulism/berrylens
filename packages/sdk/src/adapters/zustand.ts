import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";
import { buildDiff, safeSnapshot } from "../diff";

export interface ZustandStoreLike<T = unknown> {
  subscribe: (listener: (state: T, prevState: T) => void) => () => void;
}

/**
 * No central Zustand store registry exists to auto-discover from, so this is
 * the one-line-per-store attach point: `inspectStore(store, "locationStore")`.
 */
export function inspectStore<T>(store: ZustandStoreLike<T>, name: string): Capture {
  return {
    name: `zustand:${name}`,
    install(emit: Emit) {
      return store.subscribe((state, prevState) => {
        const diff = buildDiff(state, prevState);
        safeEmit(emit, {
          id: generateId(),
          timestamp: Date.now(),
          category: "state",
          label: `${name} updated`,
          data: { store: name, changed: Object.keys(diff), diff, state: safeSnapshot(state) },
        });
      });
    },
  };
}
