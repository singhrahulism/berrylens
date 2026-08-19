import { describe, expect, it, vi } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { patchAsyncStorage, type AsyncStorageLike } from "./storage";

function createFakeAsyncStorage(): AsyncStorageLike {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(async () => store.clear()),
  } as unknown as AsyncStorageLike;
}

describe("patchAsyncStorage", () => {
  it("captures a setItem call", async () => {
    const storage = createFakeAsyncStorage();
    const events: InspectorEvent[] = [];
    const uninstall = patchAsyncStorage(storage, (event) => events.push(event));

    await storage.setItem("token", "abc123");

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("storage");
    expect(events[0].label).toBe("setItem token");
    expect(events[0].data.key).toBe("token");

    uninstall();
  });

  it("captures a failed call", async () => {
    const storage: AsyncStorageLike = {
      getItem: vi.fn(async () => {
        throw new Error("disk full");
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    } as unknown as AsyncStorageLike;

    const events: InspectorEvent[] = [];
    const uninstall = patchAsyncStorage(storage, (event) => events.push(event));

    await expect(storage.getItem("token")).rejects.toThrow("disk full");
    // the emit happens in a .catch() microtask after the rejection is observed
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toHaveLength(1);
    expect(events[0].label).toContain("failed");

    uninstall();
  });

  it("restores original methods on uninstall", () => {
    const storage = createFakeAsyncStorage();
    const originalSetItem = storage.setItem;
    const uninstall = patchAsyncStorage(storage, () => {});
    uninstall();
    expect(storage.setItem).toBe(originalSetItem);
  });
});
