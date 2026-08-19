import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";
import { buildDiff, safeSnapshot } from "../diff";

export interface ReduxAction {
  type: string;
  [key: string]: unknown;
}

export interface ReduxStoreLike {
  dispatch: (action: ReduxAction) => unknown;
  getState: () => unknown;
}

/**
 * Wraps `store.dispatch` on the instance directly rather than requiring
 * `applyMiddleware` setup — the whole point is a one-line attach:
 * `attachInspector({ reduxStore: store })`.
 */
export function reduxAdapter(store: ReduxStoreLike, name = "redux"): Capture {
  return {
    name: `redux:${name}`,
    install(emit: Emit) {
      const originalDispatch = store.dispatch;

      store.dispatch = ((action: ReduxAction) => {
        const start = Date.now();
        const previousState = store.getState();
        const result = originalDispatch(action);
        const nextState = store.getState();
        const diff = buildDiff(nextState, previousState);
        safeEmit(emit, {
          id: generateId(),
          timestamp: start,
          category: "state",
          label: `${name}: ${action?.type ?? "unknown action"}`,
          durationMs: Date.now() - start,
          data: { store: name, action, changed: Object.keys(diff), diff, state: safeSnapshot(nextState) },
        });
        return result;
      }) as typeof store.dispatch;

      return () => {
        store.dispatch = originalDispatch;
      };
    },
  };
}
