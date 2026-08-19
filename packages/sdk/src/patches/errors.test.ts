import { describe, expect, it, vi } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { errorsCapture } from "./errors";

describe("errorsCapture", () => {
  it("captures global errors via ErrorUtils and forwards to the original handler", () => {
    const handlers: Array<(error: Error, isFatal?: boolean) => void> = [];
    const originalHandler = vi.fn();
    (globalThis as Record<string, unknown>).ErrorUtils = {
      getGlobalHandler: () => originalHandler,
      setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => handlers.push(handler),
    };

    const events: InspectorEvent[] = [];
    const uninstall = errorsCapture.install((event) => events.push(event));

    const err = new Error("boom");
    handlers[0](err, true);

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("error");
    expect(events[0].label).toBe("Fatal: boom");
    expect(originalHandler).toHaveBeenCalledWith(err, true);

    uninstall();
    delete (globalThis as Record<string, unknown>).ErrorUtils;
  });

  it("captures unhandled rejections via addEventListener", () => {
    const listeners: Record<string, Array<(event: { reason?: unknown }) => void>> = {};
    (globalThis as Record<string, unknown>).addEventListener = (
      type: string,
      listener: (event: { reason?: unknown }) => void,
    ) => {
      (listeners[type] ??= []).push(listener);
    };
    (globalThis as Record<string, unknown>).removeEventListener = (
      type: string,
      listener: (event: { reason?: unknown }) => void,
    ) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    };

    const events: InspectorEvent[] = [];
    const uninstall = errorsCapture.install((event) => events.push(event));

    listeners.unhandledrejection[0]({ reason: new Error("rejected") });

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("error");
    expect(events[0].label).toContain("Unhandled rejection");

    uninstall();
    delete (globalThis as Record<string, unknown>).addEventListener;
    delete (globalThis as Record<string, unknown>).removeEventListener;
  });

  it("no-ops without throwing when neither API is present", () => {
    expect(() => errorsCapture.install(() => {})()).not.toThrow();
  });
});
