import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { findGlobalMatches } from "./search";

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

describe("findGlobalMatches", () => {
  it("returns nothing for an empty query", () => {
    const events = [makeEvent({ label: "anything" })];
    expect(findGlobalMatches(events, "")).toEqual([]);
    expect(findGlobalMatches(events, "   ")).toEqual([]);
  });

  it("matches on the label, case-insensitively", () => {
    const target = makeEvent({ id: "a", label: "GET /users/442" });
    const other = makeEvent({ id: "b", label: "GET /posts" });
    expect(findGlobalMatches([target, other], "USERS/442").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches on category", () => {
    const network = makeEvent({ id: "a", category: "network", label: "x" });
    const state = makeEvent({ id: "b", category: "state", label: "y" });
    expect(findGlobalMatches([network, state], "network").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches inside the payload data, not just the label — the actual point of the feature", () => {
    const target = makeEvent({
      id: "a",
      label: "POST /wave",
      data: { requestHeaders: { Authorization: "Bearer secret-token-9f2c" } },
    });
    const other = makeEvent({ id: "b", label: "GET /users" });
    expect(findGlobalMatches([target, other], "9f2c").map((e) => e.id)).toEqual(["a"]);
  });

  it("returns results most-recent-first", () => {
    const older = makeEvent({ id: "older", label: "wave", timestamp: 100 });
    const newer = makeEvent({ id: "newer", label: "wave", timestamp: 200 });
    expect(findGlobalMatches([older, newer], "wave").map((e) => e.id)).toEqual(["newer", "older"]);
  });
});
