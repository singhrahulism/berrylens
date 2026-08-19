import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { inspectStore, type ZustandStoreLike } from "./zustand";

interface LocationState {
  lat: number;
  lng: number;
}

function createFakeZustandStore(initial: LocationState) {
  let state = initial;
  const listeners: Array<(state: LocationState, prev: LocationState) => void> = [];

  const store: ZustandStoreLike<LocationState> = {
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
  };

  return {
    store,
    setState: (partial: Partial<LocationState>) => {
      const prev = state;
      state = { ...state, ...partial };
      listeners.forEach((l) => l(state, prev));
    },
  };
}

describe("inspectStore", () => {
  it("captures a state update with only the changed keys", () => {
    const fake = createFakeZustandStore({ lat: 0, lng: 0 });
    const events: InspectorEvent[] = [];
    const uninstall = inspectStore(fake.store, "locationStore").install((event) => events.push(event));

    fake.setState({ lat: 12 });

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("state");
    expect(events[0].label).toBe("locationStore updated");
    expect(events[0].data.changed).toEqual(["lat"]);
    // the point of the feature: the old value alongside the new one, not
    // just "lat changed" with two full snapshots to eyeball for the diff
    expect(events[0].data.diff).toEqual({ lat: { from: 0, to: 12 } });

    uninstall();
  });

  it("stops emitting after uninstall", () => {
    const fake = createFakeZustandStore({ lat: 0, lng: 0 });
    const events: InspectorEvent[] = [];
    const uninstall = inspectStore(fake.store, "locationStore").install((event) => events.push(event));

    uninstall();
    fake.setState({ lat: 99 });

    expect(events).toHaveLength(0);
  });
});
