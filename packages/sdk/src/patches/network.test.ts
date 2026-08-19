import { describe, expect, it, vi } from "vitest";
import type { InspectorEvent } from "@berrylens/protocol";
import { networkCapture } from "./network";

describe("networkCapture", () => {
  it("captures a successful fetch call", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

    const events: InspectorEvent[] = [];
    const uninstall = networkCapture.install((event) => events.push(event));

    await fetch("http://example.com/users", { method: "GET" });

    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("network");
    expect(events[0].label).toBe("GET http://example.com/users 200");
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
    // regression check: duration must not also be baked into the label
    expect(events[0].label).not.toMatch(/ms/);

    uninstall();
    globalThis.fetch = originalFetch;
  });

  it("captures a failed fetch call", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const events: InspectorEvent[] = [];
    const uninstall = networkCapture.install((event) => events.push(event));

    await expect(fetch("http://example.com/fail")).rejects.toThrow("network down");

    expect(events).toHaveLength(1);
    expect(events[0].label).toContain("failed");
    expect(events[0].data.error).toBe("network down");

    uninstall();
    globalThis.fetch = originalFetch;
  });

  it("captures full request/response headers and JSON bodies, uncapped", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ id: 1 }] }), {
        status: 200,
        headers: { "content-type": "application/json", "x-custom": "abc" },
      }),
    ) as unknown as typeof fetch;

    const events: InspectorEvent[] = [];
    const uninstall = networkCapture.install((event) => events.push(event));

    await fetch("http://example.com/nearby", {
      method: "POST",
      headers: { Authorization: "Bearer secret-token", "Content-Type": "application/json" },
      body: JSON.stringify({ radius: 10 }),
    });

    expect(events).toHaveLength(1);
    const { data } = events[0];
    expect(data.requestHeaders).toEqual({ Authorization: "Bearer secret-token", "Content-Type": "application/json" });
    expect(data.requestBody).toEqual({ radius: 10 });
    expect(data.responseHeaders).toMatchObject({ "content-type": "application/json", "x-custom": "abc" });
    expect(data.responseBody).toEqual({ results: [{ id: 1 }] });

    uninstall();
    globalThis.fetch = originalFetch;
  });

  it("skips reading likely-binary response bodies rather than corrupting them as text", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response("binary-ish-payload", { status: 200, headers: { "content-type": "image/png" } }),
    ) as unknown as typeof fetch;

    const events: InspectorEvent[] = [];
    const uninstall = networkCapture.install((event) => events.push(event));

    await fetch("http://example.com/avatar.png");

    expect(events[0].data.responseBody).toBe("[binary omitted: image/png]");

    uninstall();
    globalThis.fetch = originalFetch;
  });

  it("restores the original fetch on uninstall", () => {
    const originalFetch = globalThis.fetch;
    const uninstall = networkCapture.install(() => {});
    uninstall();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
