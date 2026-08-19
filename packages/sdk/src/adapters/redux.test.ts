import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { reduxAdapter, type ReduxAction, type ReduxStoreLike } from "./redux";

function createFakeStore(initialState: { count: number }): ReduxStoreLike {
  let state = initialState;
  return {
    dispatch: (action: ReduxAction) => {
      if (action.type === "increment") state = { ...state, count: state.count + 1 };
      return action;
    },
    getState: () => state,
  };
}

describe("reduxAdapter", () => {
  it("captures a dispatch with the resulting state", () => {
    const store = createFakeStore({ count: 0 });
    const events: InspectorEvent[] = [];
    const capture = reduxAdapter(store, "counter");
    const uninstall = capture.install((event) => events.push(event));

    store.dispatch({ type: "increment" });

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("state");
    expect(events[0].label).toBe("counter: increment");
    expect((events[0].data.state as { count: number }).count).toBe(1);
    expect(events[0].data.diff).toEqual({ count: { from: 0, to: 1 } });

    uninstall();
  });

  it("restores the original dispatch on uninstall", () => {
    const store = createFakeStore({ count: 0 });
    const originalDispatch = store.dispatch;
    const capture = reduxAdapter(store);
    const uninstall = capture.install(() => {});
    uninstall();
    expect(store.dispatch).toBe(originalDispatch);
  });
});
