import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { navigationAdapter, type NavigationContainerRefLike } from "./navigation";

function createFakeNavigationRef(initialRoute: string) {
  let listener: ((event: { data: { state: unknown } }) => void) | undefined;

  const ref: NavigationContainerRefLike = {
    addListener: (_type, cb) => {
      listener = cb;
      return () => {
        listener = undefined;
      };
    },
    getCurrentRoute: () => ({ name: initialRoute }),
  };

  return {
    ref,
    fireStateChange: (routeName: string) =>
      listener?.({ data: { state: { index: 0, routes: [{ name: routeName }] } } }),
  };
}

describe("navigationAdapter", () => {
  it("captures a route transition", () => {
    const fake = createFakeNavigationRef("Map");
    const events: InspectorEvent[] = [];
    const uninstall = navigationAdapter(fake.ref).install((event) => events.push(event));

    fake.fireStateChange("PersonSheet");

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("navigation");
    expect(events[0].label).toBe("Map → PersonSheet");
    expect(events[0].data).toEqual({ from: "Map", to: "PersonSheet" });

    uninstall();
  });

  it("does not emit when the route hasn't actually changed", () => {
    const fake = createFakeNavigationRef("Map");
    const events: InspectorEvent[] = [];
    const uninstall = navigationAdapter(fake.ref).install((event) => events.push(event));

    fake.fireStateChange("Map");

    expect(events).toHaveLength(0);

    uninstall();
  });
});
