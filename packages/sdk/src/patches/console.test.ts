import { describe, expect, it } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { consoleCapture } from "./console";

describe("consoleCapture", () => {
  it("captures console.log and console.error with level tagged in data", () => {
    const events: InspectorEvent[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    // set to no-ops before install so the capture's "original" (called through)
    // doesn't spam test output
    console.log = () => {};
    console.error = () => {};

    const uninstall = consoleCapture.install((event) => events.push(event));

    console.log("hello", "world");
    console.error("boom");

    uninstall();
    console.log = originalLog;
    console.error = originalError;

    expect(events).toHaveLength(2);
    expect(events[0].category).toBe("console");
    expect(events[0].label).toBe("hello world");
    expect(events[0].data.level).toBe("log");
    expect(events[1].data.level).toBe("error");
  });

  it("restores the original console methods on uninstall", () => {
    const originalLog = console.log;
    const uninstall = consoleCapture.install(() => {});
    uninstall();
    expect(console.log).toBe(originalLog);
  });
});
