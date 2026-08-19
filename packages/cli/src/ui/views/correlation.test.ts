import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { findNearbyEvents } from "./correlation";

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

describe("findNearbyEvents", () => {
  it("includes events across categories within the time window, sorted chronologically", () => {
    const center = makeEvent({ id: "center", timestamp: 1000, category: "network", label: "POST /wave" });
    const before = makeEvent({ id: "before", timestamp: 900, category: "state", label: "locationStore updated" });
    const after = makeEvent({ id: "after", timestamp: 1100, category: "query", label: "nearbyPeople invalidated" });

    const result = findNearbyEvents([before, center, after], center, 500);

    expect(result.map((r) => r.event.id)).toEqual(["before", "center", "after"]);
    expect(result.map((r) => r.offsetMs)).toEqual([-100, 0, 100]);
  });

  it("marks exactly the center event", () => {
    const center = makeEvent({ id: "center", timestamp: 1000 });
    const other = makeEvent({ id: "other", timestamp: 1000 });

    const result = findNearbyEvents([center, other], center, 500);

    expect(result.find((r) => r.event.id === "center")?.isCenter).toBe(true);
    expect(result.find((r) => r.event.id === "other")?.isCenter).toBe(false);
  });

  it("excludes events outside the window", () => {
    const center = makeEvent({ id: "center", timestamp: 1000 });
    const farAway = makeEvent({ id: "far", timestamp: 5000 });

    const result = findNearbyEvents([center, farAway], center, 500);

    expect(result.map((r) => r.event.id)).toEqual(["center"]);
  });

  it("includes events exactly at the window boundary", () => {
    const center = makeEvent({ id: "center", timestamp: 1000 });
    const atBoundary = makeEvent({ id: "boundary", timestamp: 1500 });

    const result = findNearbyEvents([center, atBoundary], center, 500);

    expect(result.map((r) => r.event.id)).toEqual(["center", "boundary"]);
  });
});
