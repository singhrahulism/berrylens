import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { sortEventsChronologically } from "./timeline";

function makeEvent(overrides: Partial<InspectorEvent>): InspectorEvent {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    timestamp: 0,
    category: "console",
    label: "test",
    data: {},
    ...overrides,
  };
}

describe("sortEventsChronologically", () => {
  it("sorts out-of-order events across categories ascending by timestamp", () => {
    const nav = makeEvent({ id: "nav", timestamp: 2000, category: "navigation", label: "Map -> PersonSheet" });
    const api = makeEvent({ id: "api", timestamp: 1000, category: "network", label: "GET /nearby" });
    const state = makeEvent({ id: "state", timestamp: 1500, category: "state", label: "locationStore updated" });

    const result = sortEventsChronologically([nav, api, state]);

    expect(result.map((e) => e.id)).toEqual(["api", "state", "nav"]);
  });

  it("is stable for equal timestamps, preserving original relative order", () => {
    const first = makeEvent({ id: "first", timestamp: 1000, category: "console" });
    const second = makeEvent({ id: "second", timestamp: 1000, category: "network" });

    const result = sortEventsChronologically([first, second]);

    expect(result.map((e) => e.id)).toEqual(["first", "second"]);
  });

  it("does not mutate the input array", () => {
    const events = [makeEvent({ id: "b", timestamp: 2000 }), makeEvent({ id: "a", timestamp: 1000 })];
    const original = [...events];

    sortEventsChronologically(events);

    expect(events).toEqual(original);
  });

  it("returns an empty array for an empty input", () => {
    expect(sortEventsChronologically([])).toEqual([]);
  });
});
