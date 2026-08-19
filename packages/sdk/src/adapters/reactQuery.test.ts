import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { reactQueryAdapter, type QueryClientLike } from "./reactQuery";

function createFakeQueryClient() {
  let queryListener: ((event: unknown) => void) | undefined;
  let mutationListener: ((event: unknown) => void) | undefined;

  const client: QueryClientLike = {
    getQueryCache: () => ({
      subscribe: (cb) => {
        queryListener = cb;
        return () => {
          queryListener = undefined;
        };
      },
    }),
    getMutationCache: () => ({
      subscribe: (cb) => {
        mutationListener = cb;
        return () => {
          mutationListener = undefined;
        };
      },
    }),
  };

  return {
    client,
    fireQueryEvent: (event: unknown) => queryListener?.(event),
    fireMutationEvent: (event: unknown) => mutationListener?.(event),
  };
}

describe("reactQueryAdapter", () => {
  it("captures a query cache event", () => {
    const fake = createFakeQueryClient();
    const events: InspectorEvent[] = [];
    const uninstall = reactQueryAdapter(fake.client).install((event) => events.push(event));

    fake.fireQueryEvent({
      type: "updated",
      query: { queryKey: ["users"], state: { status: "success", data: [{ id: 1, name: "Ada" }] } },
    });

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("query");
    expect(events[0].label).toBe("users success");
    expect(events[0].data.queryKey).toEqual(["users"]);
    // the actual resolved result must be captured, not just status/key
    expect(events[0].data.result).toEqual([{ id: 1, name: "Ada" }]);

    uninstall();
  });

  it("captures a mutation cache event", () => {
    const fake = createFakeQueryClient();
    const events: InspectorEvent[] = [];
    const uninstall = reactQueryAdapter(fake.client).install((event) => events.push(event));

    fake.fireMutationEvent({
      type: "updated",
      mutation: { options: { mutationKey: ["wave"] }, state: { status: "success" } },
    });

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe("mutation wave success");

    uninstall();
  });
});
