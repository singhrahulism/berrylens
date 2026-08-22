import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { EventEmitter } from "node:events";
import type { InspectorEvent } from "@berrylens/protocol";
import { App } from "./App";

class FakeServer extends EventEmitter {
  getHistory(): InspectorEvent[] {
    return [];
  }
}

function makeEvent(overrides: Partial<InspectorEvent> = {}): InspectorEvent {
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    category: "navigation",
    label: "Map → PersonSheet",
    data: { from: "Map", to: "PersonSheet" },
    ...overrides,
  };
}

/** Lets the mount `useEffect` (subscribing to the server) and any pending
 * state updates settle before the next assertion — React 18 schedules
 * passive effects on a macrotask, which doesn't happen automatically between
 * two synchronous statements in a test body. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The ink-testing-library stdout stub doesn't implement `rows` at all
 * (only a fixed `columns: 100`), so it's not otherwise settable. Tests that
 * care about exact visible-row counts need a real value instead of App's
 * conservative 24-row fallback. */
function stdoutRows(stdout: { rows?: number }, rows: number): void {
  Object.defineProperty(stdout, "rows", { value: rows, configurable: true });
}

describe("App", () => {
  it("renders all default pane titles", async () => {
    const server = new FakeServer();
    const { lastFrame } = render(<App server={server} metroTarget={null} />);
    await flush();
    const frame = lastFrame() ?? "";

    expect(frame).toContain("NAV / SCREEN");
    expect(frame).toContain("GLOBAL STATE");
    expect(frame).toContain("API CALLS");
    expect(frame).toContain("QUERY CACHE");
    expect(frame).toContain("CONSOLE / ERRORS");
  });

  it("routes an emitted event into its matching pane", async () => {
    const server = new FakeServer();
    const { lastFrame } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "network", label: "GET /users 200" }));
    await flush();

    expect(lastFrame() ?? "").toContain("GET /users 200");
  });

  it("displays a pane's events in timestamp order even when they arrive out of order", async () => {
    // concurrent requests emit on completion, not on start — a request that
    // started later but finished faster can arrive before one that started
    // earlier and is still in flight, so arrival order isn't timestamp order
    const server = new FakeServer();
    const { lastFrame } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "network", label: "started-later-finished-first", timestamp: 200 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "started-earlier-still-in-flight", timestamp: 100 }));
    await flush();

    const frame = lastFrame() ?? "";
    const earlierIndex = frame.indexOf("started-earlier-still-in-flight");
    const laterIndex = frame.indexOf("started-later-finished-first");
    expect(earlierIndex).toBeGreaterThan(-1);
    expect(laterIndex).toBeGreaterThan(-1);
    expect(earlierIndex).toBeLessThan(laterIndex); // sorted by timestamp, not arrival order
  });

  it("shows history events already buffered on the server at mount", async () => {
    class ServerWithHistory extends FakeServer {
      override getHistory(): InspectorEvent[] {
        return [makeEvent({ category: "state", label: "authStore updated" })];
      }
    }
    const { lastFrame } = render(<App server={new ServerWithHistory()} metroTarget={null} />);
    await flush();

    expect(lastFrame() ?? "").toContain("authStore updated");
  });

  it("opens the detail overlay on enter and shows back/dump hints", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent());
    await flush();
    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("esc back");
    expect(frame).toContain("Map → PersonSheet");
  });

  it("shows the JSON tree collapsed by default, and expands a nested key on enter", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({ data: { from: "Map", to: "PersonSheet", nested: { deep: "value" } } }),
    );
    await flush();
    stdin.write("\r");
    await flush();

    // root's direct children are visible, but the nested object starts collapsed
    let frame = lastFrame() ?? "";
    expect(frame).toContain("nested: {1 key}");
    expect(frame).not.toContain("deep:");

    // cursor starts on the root line; move down to the "nested" line, then expand it
    stdin.write("j");
    await flush();
    stdin.write("j");
    await flush();
    stdin.write("j");
    await flush();
    stdin.write("\r");
    await flush();

    frame = lastFrame() ?? "";
    expect(frame).toContain("deep:");
  });

  it("toggles to raw JSON with 'v' and back", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ data: { from: "Map", to: "PersonSheet" } }));
    await flush();
    stdin.write("\r");
    await flush();

    expect(lastFrame() ?? "").toContain("v raw JSON");

    stdin.write("v");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("v tree view");
    expect(frame).toContain('"from": "Map"');
  });

  it("hides the pane grid while the detail view is open (full-screen, not squeezed below it)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent());
    await flush();
    expect(lastFrame() ?? "").toContain("API CALLS");

    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("esc back");
    // the grid (and its other pane titles) must not still be rendered underneath
    expect(frame).not.toContain("API CALLS");
    expect(frame).not.toContain("QUERY CACHE");
  });

  it("does nothing on enter when the focused pane has no events (no silent blank detail view)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    // default focus is NAV / SCREEN, which starts empty
    stdin.write("\r");
    await flush();

    expect(lastFrame() ?? "").not.toContain("esc back");
  });

  it("shows the structured network view for a network event", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({
        category: "network",
        label: "GET /api/v1/discovery/nearby 200",
        data: { method: "GET", url: "/api/v1/discovery/nearby", status: 200, responseBody: { results: [] } },
      }),
    );
    await flush();
    // focus order is nav, state, api, query, console — tab twice to reach API CALLS
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("REQUEST");
    expect(frame).toContain("RESPONSE");
  });

  it("closes the detail overlay on escape", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent());
    await flush();
    stdin.write("\r");
    await flush();
    expect(lastFrame() ?? "").toContain("esc back");

    stdin.write("\x1B");
    await flush();
    expect(lastFrame() ?? "").not.toContain("esc back");
  });

  it("shows connection status once hello arrives", async () => {
    const server = new FakeServer();
    const { lastFrame } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("hello", { type: "hello", appName: "MyApp", platform: "ios" });
    await flush();

    expect(lastFrame() ?? "").toContain("MyApp (ios)");
  });

  it("clears events on 'c'", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ label: "one-off nav event" }));
    await flush();
    expect(lastFrame() ?? "").toContain("one-off nav event");

    stdin.write("c");
    await flush();
    expect(lastFrame() ?? "").not.toContain("one-off nav event");
  });

  it("scrolling up in a pane reveals older history, not just the tail window", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    // enough events to guarantee the pane can't show them all at once
    for (let i = 0; i < 15; i += 1) {
      server.emit("event", makeEvent({ label: `history-event-${i}` }));
      await flush();
    }

    let frame = lastFrame() ?? "";
    expect(frame).toContain("history-event-14"); // most recent, visible by default
    expect(frame).not.toContain("history-event-0"); // oldest, off the top of the tail window

    for (let i = 0; i < 20; i += 1) {
      stdin.write("k");
      await flush();
    }

    frame = lastFrame() ?? "";
    expect(frame).toContain("history-event-0"); // scrolling up must reveal it, not just clamp
  });

  it("network detail panel B shows QUERY PARAMS when there's no captured request body", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({
        category: "network",
        label: "GET /search?q=ada 200",
        data: { method: "GET", url: "/search?q=ada", status: 200, responseBody: { results: [] } },
      }),
    );
    await flush();
    stdin.write("\t"); // nav -> state
    await flush();
    stdin.write("\t"); // state -> api
    await flush();
    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("QUERY PARAMS");
    expect(frame).not.toContain("REQUEST BODY");
  });

  it("network detail panel B shows REQUEST BODY when one was captured", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({
        category: "network",
        label: "POST /wave 201",
        data: { method: "POST", url: "/wave", status: 201, requestBody: { targetUserId: "442" } },
      }),
    );
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("REQUEST BODY");
    expect(frame).not.toContain("QUERY PARAMS");
  });

  it("only the Tab-focused network sub-panel responds to 'v' (no double-handling)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({
        category: "network",
        label: "GET /nearby 200",
        data: { method: "GET", url: "/nearby", status: 200, responseBody: { results: [{ id: 1 }] } },
      }),
    );
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\r"); // opens detail, focus defaults to panel C (RESPONSE)
    await flush();

    // C starts in tree mode; 'v' should flip it to raw
    stdin.write("v");
    await flush();
    expect(lastFrame() ?? "").toContain("v tree view"); // hint text only shown while in raw mode

    // move focus to A (Tab from C wraps to A) — 'v' there must not affect C's mode
    stdin.write("\t");
    await flush();
    stdin.write("v");
    await flush();

    expect(lastFrame() ?? "").toContain("v tree view"); // C is still in raw mode, unaffected
  });

  it("enter toggles a tree node closed again, not just open", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ data: { nested: { deep: "value" } } }));
    await flush();
    stdin.write("\r"); // open detail
    await flush();
    stdin.write("j"); // move to "nested"
    await flush();
    stdin.write("\r"); // expand it
    await flush();
    expect(lastFrame() ?? "").toContain("deep:");

    stdin.write("\r"); // press enter again on the same (still-selected) node
    await flush();
    expect(lastFrame() ?? "").not.toContain("deep:");
  });

  it("scrolling up in a pane stops at the oldest event instead of climbing forever", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    for (let i = 0; i < 5; i += 1) {
      server.emit("event", makeEvent({ label: `bounded-event-${i}` }));
      await flush();
    }

    // press up far more times than there are events
    for (let i = 0; i < 30; i += 1) {
      stdin.write("k");
      await flush();
    }

    const frame = lastFrame() ?? "";
    // the oldest event must still be visible and selectable, not scrolled past into a blank selection
    expect(frame).toContain("bounded-event-0");
    stdin.write("\r");
    await flush();
    // opening detail on it must actually show its content — proves the
    // selection genuinely landed on event-0, not on an out-of-range index
    expect(lastFrame() ?? "").toContain("bounded-event-0");
  });

  it("correlation strip surfaces nearby events across other categories, not just the current pane", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const now = Date.now();
    server.emit(
      "event",
      makeEvent({ category: "navigation", label: "Map → PersonSheet", timestamp: now }),
    );
    await flush();
    // a state update 120ms away — a different pane entirely, well within the ±500ms window
    server.emit(
      "event",
      makeEvent({ category: "state", label: "connectionStore updated", timestamp: now + 120 }),
    );
    await flush();
    // and something far outside the window that must NOT show up
    server.emit(
      "event",
      makeEvent({ category: "console", label: "unrelated far-off log", timestamp: now + 10_000 }),
    );
    await flush();

    stdin.write("\r"); // open detail on the nav event (default focus)
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("NEARBY");
    expect(frame).toContain("connectionStore updated");
    expect(frame).not.toContain("unrelated far-off log");
  });

  it("pressing 'y' on a network event exports a working curl command", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const eventId = "curl-export-test-id";
    server.emit(
      "event",
      makeEvent({
        id: eventId,
        category: "network",
        label: "POST /wave 201",
        data: {
          method: "POST",
          url: "https://api.example.com/wave",
          requestHeaders: { Authorization: "Bearer abc123" },
          requestBody: { targetUserId: "442" },
        },
      }),
    );
    await flush();
    stdin.write("\t"); // nav -> state
    await flush();
    stdin.write("\t"); // state -> api
    await flush();
    stdin.write("\r"); // open detail
    await flush();
    stdin.write("y");
    await flush();

    // confirmation shows in the status bar, exact text depends on whether a
    // system clipboard tool is available — either way a file gets written
    expect(lastFrame() ?? "").toMatch(/curl (copied to clipboard|saved to)/);

    // find the file directly by its known naming pattern rather than parsing
    // the rendered frame — a full temp path can wrap across lines in a
    // narrow terminal, which isn't a bug, just unreliable to regex out of
    // terminal output
    const targetName = `curl-${eventId}.sh`;
    const matchingDir = readdirSync(tmpdir()).find(
      (name) => name.startsWith("berrylens-") && readdirSync(join(tmpdir(), name)).includes(targetName),
    );
    expect(matchingDir).toBeDefined();

    const contents = readFileSync(join(tmpdir(), matchingDir!, targetName), "utf8");
    expect(contents).toContain("curl");
    expect(contents).toContain("-X 'POST'");
    expect(contents).toContain("-H 'Authorization: Bearer abc123'");
    expect(contents).toContain("'https://api.example.com/wave'");
  });

  it("global search finds a match buried in another pane's payload and jumps to its detail view", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    // focus stays on NAV/SCREEN (default) — the match lives in API CALLS,
    // proving this isn't just the existing pane-scoped filter
    server.emit(
      "event",
      makeEvent({
        category: "network",
        label: "GET /profile 200",
        data: { method: "GET", url: "/profile", responseHeaders: { "x-trace-id": "trace-9f2c-elsewhere" } },
      }),
    );
    await flush();

    stdin.write("?");
    await flush();
    expect(lastFrame() ?? "").toContain("SEARCH");

    for (const char of "9f2c") {
      stdin.write(char);
      await flush();
    }

    let frame = lastFrame() ?? "";
    expect(frame).toContain("1 match");
    expect(frame).toContain("GET /profile 200");

    stdin.write("\r");
    await flush();

    frame = lastFrame() ?? "";
    expect(frame).toContain("GET /profile"); // in the REQUEST panel of the network detail view
    expect(frame).toContain("trace-9f2c-elsewhere"); // response header — proves it landed on the right event
    // and the grid must be gone — landed in the real detail view, not still in search
    expect(frame).not.toContain("SEARCH (all categories)");
  });

  it("search-select lands on the searched event even when arrival order and timestamp order disagree", async () => {
    // simulates two concurrent requests finishing out of start-order — the
    // second one emitted (arrival order) has the EARLIER timestamp, so the
    // pane's actual (sorted) render order is the reverse of arrival order.
    // Timestamps are >500ms apart so the correlation strip's "NEARBY" list
    // (±500ms) can't smuggle the other event's label into the frame and
    // mask a wrong-event selection.
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "state", label: "search-x", timestamp: 1000 }));
    await flush();
    server.emit("event", makeEvent({ category: "state", label: "search-y", timestamp: 100 }));
    await flush();

    stdin.write("?");
    await flush();
    for (const char of "search-y") {
      stdin.write(char);
      await flush();
    }
    stdin.write("\r");
    await flush();

    // the generic detail overlay's header is "CATEGORY › label" — asserting
    // on it specifically (not just "frame contains search-y" anywhere)
    // proves this is the event actually opened, not just mentioned nearby
    expect(lastFrame() ?? "").toContain("STATE › search-y");
  });

  it("selecting a search result in a different pane clears a range anchored in the pane you searched from", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "navigation", label: "nav-a" }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-b" }));
    await flush();
    for (let i = 0; i < 5; i++) {
      server.emit("event", makeEvent({ category: "network", label: `api-${i}` }));
      await flush();
    }

    // extend a range in NAV / SCREEN (the default-focused pane)
    stdin.write("K");
    await flush();

    // search for an API CALLS event and jump to it
    stdin.write("?");
    await flush();
    for (const char of "api-2") {
      stdin.write(char);
      await flush();
    }
    stdin.write("\r");
    await flush();

    // back to the grid — API CALLS is now focused; it must not inherit
    // NAV's leftover range (from-end index 1 there is meaningless here)
    stdin.write("\x1b");
    await flush();

    expect(lastFrame() ?? "").not.toContain("(range:");
  });

  it("esc cancels search and returns to the dashboard without selecting anything", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("?");
    await flush();
    stdin.write("x");
    await flush();
    stdin.write("\x1B");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("SEARCH (all categories)");
    expect(frame).toContain("NAV / SCREEN");
  });

  it("shows a diff view for a state event carrying a captured diff", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({
        category: "state",
        label: "locationStore updated",
        data: { store: "locationStore", changed: ["lat"], diff: { lat: { from: 0, to: 12.4194 } }, state: { lat: 12.4194 } },
      }),
    );
    await flush();
    stdin.write("\t"); // nav -> state
    await flush();
    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("CHANGED (1)");
    expect(frame).toContain("12.4194");
  });

  it("falls back to the generic tree view for a state event with no diff captured", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({ category: "state", label: "someStore updated", data: { store: "someStore" } }),
    );
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\r");
    await flush();

    expect(lastFrame() ?? "").not.toContain("CHANGED");
  });

  it("shows an error counter in the status bar visible regardless of which pane you're looking at", async () => {
    const server = new FakeServer();
    const { lastFrame } = render(<App server={server} metroTarget={null} />);
    await flush();

    expect(lastFrame() ?? "").not.toContain("error");

    server.emit("event", makeEvent({ category: "error", label: "TypeError: boom" }));
    await flush();
    expect(lastFrame() ?? "").toContain("⚠ 1 error");

    server.emit("event", makeEvent({ category: "error", label: "another one" }));
    await flush();
    expect(lastFrame() ?? "").toContain("⚠ 2 errors");
  });

  it("clears the error flash a few seconds after the last error, but keeps the count", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const server = new FakeServer();
      const { lastFrame } = render(<App server={server} metroTarget={null} />);
      await flush();

      server.emit("event", makeEvent({ category: "error", label: "boom" }));
      await flush();
      expect(lastFrame() ?? "").toContain("⚠ 1 error");

      vi.advanceTimersByTime(3000);
      await flush();

      // still counted, just no longer in the attention-grabbing flash state
      expect(lastFrame() ?? "").toContain("⚠ 1 error");
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks events at-or-after the focused pane's selected timestamp in every other pane", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const t = 1_000_000;
    // two nav events so there's something to select between via j/k
    server.emit("event", makeEvent({ category: "navigation", label: "nav-older", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-newer", timestamp: t + 50 }));
    await flush();
    // API events on either side of t
    server.emit("event", makeEvent({ category: "network", label: "api-before", timestamp: t - 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-after", timestamp: t + 100 }));
    await flush();

    // default selection is the most recent nav event (nav-newer) — move up once to select nav-older (t)
    stdin.write("k");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/▸ .*api-after/);
    expect(frame).not.toMatch(/▸ .*api-before/);
    expect(frame).toContain("api-before"); // still shown, just unmarked
  });

  it("Shift+K/J extends a range selection, marking events inside it (both ends inclusive) in other panes", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const t = 2_000_000;
    server.emit("event", makeEvent({ category: "navigation", label: "nav-t", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-t50", timestamp: t + 50 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-t100", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-before-range", timestamp: t - 10 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-in-range", timestamp: t + 30 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-after-range", timestamp: t + 150 }));
    await flush();

    // default selection is the most recent nav event (nav-t100); extend the
    // range down to nav-t50, then to nav-t — range should span [t, t+100]
    stdin.write("K");
    await flush();
    stdin.write("K");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("(range: 3)"); // nav-t, nav-t50, nav-t100
    expect(frame).toMatch(/▸ .*api-in-range/);
    expect(frame).not.toMatch(/▸ .*api-before-range/);
    expect(frame).not.toMatch(/▸ .*api-after-range/);
    expect(frame).toContain("api-before-range"); // shown, just unmarked
    expect(frame).toContain("api-after-range");
  });

  it("p pins the selected event as the highlight anchor, marking it and surviving a focus change", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const t = 3_000_000;
    server.emit("event", makeEvent({ category: "network", label: "api-pinned", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-before", timestamp: t - 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-after", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "query", label: "query-after", timestamp: t + 200 }));
    await flush();

    // focus order is nav -> state -> api -> query -> console; two Tabs from
    // the default (nav) lands on API CALLS
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("p");
    await flush();

    let frame = lastFrame() ?? "";
    expect(frame).toMatch(/◆ .*api-pinned/); // marked even while its own pane is focused
    expect(frame).toMatch(/▸ .*nav-after/);
    expect(frame).not.toMatch(/▸ .*nav-before/);
    expect(frame).toContain("pinned: api-pinned");

    // move focus to QUERY CACHE — the anchor should stay on the pinned event,
    // not follow the cursor, AND the highlight should still show up in
    // whichever pane you're now focused on, not just the panes you're not
    // looking at (query-after qualifies at t+200 >= t)
    stdin.write("\t");
    await flush();

    frame = lastFrame() ?? "";
    expect(frame).toMatch(/◆ .*api-pinned/);
    expect(frame).toMatch(/▸ .*nav-after/);
    expect(frame).not.toMatch(/▸ .*nav-before/);
    expect(frame).toMatch(/▸ .*query-after/);
  });

  it("pinning a range with tied timestamps only marks the two events actually selected, not every same-timestamp sibling", async () => {
    // several concurrent requests can legitimately finish within the same
    // millisecond — pinning two specific events that happen to share a
    // timestamp with unselected siblings must not sweep those siblings in
    // via a naive timestamp-bounds check (see pinnedRangeEventIds)
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const t = 5_000_000;
    server.emit("event", makeEvent({ category: "network", label: "a1", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "a2", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "a3", timestamp: t })); // will be pinned
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "b1", timestamp: t + 100 })); // will be pinned
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "b2", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "b3", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "b4", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-mid", timestamp: t + 50 }));
    await flush();

    // sorted ascending: a1, a2, a3, b1, b2, b3, b4 — default cursor is the
    // most recent (b4); move up to b1, then extend the range to a3
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("k");
    await flush();
    stdin.write("k");
    await flush();
    stdin.write("k");
    await flush();
    stdin.write("K");
    await flush();
    stdin.write("p");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/◆ .*\ba3\b/);
    expect(frame).toMatch(/◆ .*\bb1\b/);
    // same-timestamp siblings that were never actually selected stay unmarked
    expect(frame).not.toMatch(/[▸◆] .*\ba1\b/);
    expect(frame).not.toMatch(/[▸◆] .*\ba2\b/);
    expect(frame).not.toMatch(/[▸◆] .*\bb2\b/);
    expect(frame).not.toMatch(/[▸◆] .*\bb3\b/);
    expect(frame).not.toMatch(/[▸◆] .*\bb4\b/);
    // a genuinely different pane's event within the time window still
    // highlights via the ordinary timestamp bounds — the id-set exactness
    // only applies within the pinned range's own category
    expect(frame).toMatch(/▸ .*nav-mid/);
  });

  it("h/g jump to the newest/oldest event, H/G jump to the newest/oldest highlighted event, in the focused pane", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const t = 6_000_000;
    server.emit("event", makeEvent({ category: "network", label: "api-a", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-b", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-early", timestamp: t - 50 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-mid1", timestamp: t + 10 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-mid2", timestamp: t + 60 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-late", timestamp: t + 200 }));
    await flush();

    // pin a range spanning [t, t+100] from API CALLS
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("K");
    await flush();
    stdin.write("p");
    await flush();

    // move to NAV / SCREEN — sorted: nav-early, nav-mid1, nav-mid2, nav-late;
    // nav-mid1/nav-mid2 fall inside [t, t+100], nav-early/nav-late don't
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();

    async function selectedLabel(): Promise<string> {
      stdin.write("\r");
      await flush();
      const frame = lastFrame() ?? "";
      stdin.write("\x1b"); // esc back to the grid
      await flush();
      return frame;
    }

    stdin.write("g");
    await flush();
    expect(await selectedLabel()).toContain("nav-early");

    stdin.write("h");
    await flush();
    expect(await selectedLabel()).toContain("nav-late");

    stdin.write("G");
    await flush();
    expect(await selectedLabel()).toContain("nav-mid1");

    stdin.write("H");
    await flush();
    expect(await selectedLabel()).toContain("nav-mid2");
  });

  it("p pins a live range (Shift+K/J then p), marking both ends and keeping the whole span highlighted after a focus change", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    const t = 4_000_000;
    server.emit("event", makeEvent({ category: "network", label: "api-t", timestamp: t }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-t50", timestamp: t + 50 }));
    await flush();
    server.emit("event", makeEvent({ category: "network", label: "api-t100", timestamp: t + 100 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-before-range", timestamp: t - 10 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-in-range", timestamp: t + 30 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "nav-after-range", timestamp: t + 150 }));
    await flush();

    // move to API CALLS, extend a range across all three api-* events, then pin it
    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("K");
    await flush();
    stdin.write("K");
    await flush();
    stdin.write("p");
    await flush();

    let frame = lastFrame() ?? "";
    expect(frame).toMatch(/◆ .*api-t100/); // both ends of the pinned range marked
    expect(frame).toMatch(/◆ .*api-t\b/);
    expect(frame).toContain("pinned: api-t");
    expect(frame).toMatch(/▸ .*nav-in-range/);
    expect(frame).not.toMatch(/▸ .*nav-before-range/);
    expect(frame).not.toMatch(/▸ .*nav-after-range/);

    // move focus away — the pinned range should keep marking the same events
    stdin.write("\t");
    await flush();

    frame = lastFrame() ?? "";
    expect(frame).toMatch(/◆ .*api-t100/);
    expect(frame).toMatch(/▸ .*nav-in-range/);
    expect(frame).not.toMatch(/▸ .*nav-before-range/);
    expect(frame).not.toMatch(/▸ .*nav-after-range/);
  });

  it("pressing p again on the pinned row unpins it", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "network", label: "api-toggle" }));
    await flush();

    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("p");
    await flush();
    expect(lastFrame() ?? "").toContain("pinned:");

    stdin.write("p");
    await flush();
    expect(lastFrame() ?? "").not.toContain("pinned:");
  });

  it("plain j/k after a range selection collapses back to a single selection", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "navigation", label: "a", timestamp: 1 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "b", timestamp: 2 }));
    await flush();

    stdin.write("K"); // start a range
    await flush();
    expect(lastFrame() ?? "").toContain("(range: 2)");

    stdin.write("j"); // plain move — should collapse the range
    await flush();
    expect(lastFrame() ?? "").not.toContain("(range:");
  });

  it("Tab clears an in-progress range in the pane being left", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "navigation", label: "a", timestamp: 1 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "b", timestamp: 2 }));
    await flush();

    stdin.write("K");
    await flush();
    expect(lastFrame() ?? "").toContain("(range: 2)");

    stdin.write("\t");
    await flush();
    stdin.write("\t"); // back to nav pane (state -> api -> ... eventually wraps, but focus alone is enough)
    await flush();

    expect(lastFrame() ?? "").not.toContain("(range:");
  });

  it("'t' opens a full-screen timeline showing events from every category in chronological order, 'd' returns to the dashboard", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "network", label: "GET /nearby", timestamp: 2000 }));
    await flush();
    server.emit("event", makeEvent({ category: "state", label: "locationStore updated", timestamp: 1000 }));
    await flush();
    server.emit("event", makeEvent({ category: "navigation", label: "Map -> PersonSheet", timestamp: 3000 }));
    await flush();

    stdin.write("t");
    await flush();
    let frame = lastFrame() ?? "";

    expect(frame).toContain("TIMELINE");
    expect(frame).not.toContain("API CALLS");
    expect(frame).not.toContain("GLOBAL STATE");
    // chronological, not arrival order: state (1000) before network (2000) before nav (3000)
    const stateIdx = frame.indexOf("locationStore updated");
    const networkIdx = frame.indexOf("GET /nearby");
    const navIdx = frame.indexOf("Map -> PersonSheet");
    expect(stateIdx).toBeGreaterThan(-1);
    expect(stateIdx).toBeLessThan(networkIdx);
    expect(networkIdx).toBeLessThan(navIdx);

    stdin.write("d");
    await flush();
    frame = lastFrame() ?? "";

    expect(frame).toContain("API CALLS");
    expect(frame).toContain("GLOBAL STATE");
    expect(frame).not.toContain("TIMELINE");
  });

  it("uppercase 'T'/'D' also toggle the timeline (both cases work, not just lowercase)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("T");
    await flush();
    expect(lastFrame() ?? "").toContain("TIMELINE");

    stdin.write("D");
    await flush();
    expect(lastFrame() ?? "").not.toContain("TIMELINE");
  });

  it("Enter opens the detail view for the selected timeline event", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit("event", makeEvent({ category: "console", label: "connected to server", timestamp: 1000 }));
    await flush();

    stdin.write("t");
    await flush();
    stdin.write("\r");
    await flush();

    expect(lastFrame() ?? "").toContain("connected to server");
  });

  // Phase 11: flexible pane system (split / close / move / zoom). Ctrl+V/Ctrl+B
  // (not Ctrl+Shift+V/H) — see keymap.ts's comment for why: Ink's raw-mode
  // parser can't encode Shift on a Ctrl+letter combo, and Ctrl+H is literally
  // the Backspace byte.
  it("Ctrl+V splits the focused pane into two independently-focusable instances of the same view", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\t"); // nav -> state
    await flush();
    stdin.write("\t"); // state -> api
    await flush();

    server.emit("event", makeEvent({ category: "network", label: "GET /nearby 200" }));
    await flush();

    stdin.write("\x16"); // Ctrl+V
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame.split("API CALLS")).toHaveLength(3); // title appears twice = 2 instances
    expect(frame.split("GET /nearby 200")).toHaveLength(3); // same underlying events, shown in both
  });

  it("Ctrl+W closes a split-created pane and restores the sibling's full space", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\x16"); // split API CALLS
    await flush();
    expect((lastFrame() ?? "").split("API CALLS")).toHaveLength(3);

    stdin.write("\x17"); // Ctrl+W — closes the newly-focused split-created instance
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame.split("API CALLS")).toHaveLength(2); // back to a single instance
    expect(frame).toContain("NAV / SCREEN"); // rest of the grid is unaffected
  });

  it("Ctrl+W closes the default-focused pane cleanly (the true last-pane no-op guardrail is unit-tested in paneTree.test.ts)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\x17"); // closes NAV / SCREEN, the default-focused pane
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("NAV / SCREEN");
    expect(frame).toContain("GLOBAL STATE"); // rest of the grid still renders, nothing crashed
  });

  it("zoom (z) still works on a pane created by a split", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\t");
    await flush();
    stdin.write("\t");
    await flush();
    stdin.write("\x16"); // split API CALLS — focus moves to the new instance
    await flush();

    stdin.write("z");
    await flush();
    let frame = lastFrame() ?? "";
    expect(frame).toContain("API CALLS");
    expect(frame).not.toContain("NAV / SCREEN");
    expect(frame).not.toContain("GLOBAL STATE");

    stdin.write("z"); // unzoom
    await flush();
    frame = lastFrame() ?? "";
    expect(frame).toContain("NAV / SCREEN");
    expect(frame.split("API CALLS")).toHaveLength(3); // both instances back
  });

  it("Ctrl+Down moves focus directly from NAV to API CALLS without Tab", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({
        category: "network",
        label: "GET /nearby 200",
        data: { method: "GET", url: "/nearby", status: 200 },
      }),
    );
    await flush();

    stdin.write("\x1b[1;5B"); // Ctrl+Down (default focus starts on NAV, empty)
    await flush();
    stdin.write("\r"); // open-detail is a no-op unless focus actually reached API CALLS
    await flush();

    expect(lastFrame() ?? "").toContain("REQUEST");
  });

  it("Ctrl+N reopens a closed default view (e.g. GLOBAL STATE) once it's been closed entirely", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\t"); // nav -> state
    await flush();
    stdin.write("\x17"); // Ctrl+W closes GLOBAL STATE entirely
    await flush();
    expect(lastFrame() ?? "").not.toContain("GLOBAL STATE");

    stdin.write("\x0e"); // Ctrl+N reopens it
    await flush();

    expect(lastFrame() ?? "").toContain("GLOBAL STATE");
  });

  it("Ctrl+O reopens a closed default view horizontally instead of vertically (direction is honored, not always Ctrl+N's row)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin, stdout } = render(<App server={server} metroTarget={null} />);
    // the ink-testing-library stdout stub doesn't implement `rows` at all, so
    // App falls back to a conservative 24 — too tight for a column-split
    // sub-pane plus the (correctly, now multi-line) footer without visually
    // corrupting; a real terminal running a multi-pane TUI is rarely that short
    stdoutRows(stdout, 28);
    await flush();

    stdin.write("\t");
    await flush();
    stdin.write("\x17"); // Ctrl+W closes GLOBAL STATE entirely
    await flush();
    expect(lastFrame() ?? "").not.toContain("GLOBAL STATE");

    stdin.write("\x0f"); // Ctrl+O reopens it stacked (column split), not side-by-side
    await flush();

    expect(lastFrame() ?? "").toContain("GLOBAL STATE");
  });

  it("Ctrl+N is a no-op once every default view already has an instance open", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\x0e"); // nothing missing in the default grid
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("NAV / SCREEN");
    expect(frame).toContain("GLOBAL STATE");
    expect(frame).toContain("API CALLS");
    expect(frame).toContain("QUERY CACHE");
    expect(frame).toContain("CONSOLE / ERRORS");
  });

  it("l opens the layout switcher; selecting Network Debug swaps the grid without losing event history", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    server.emit(
      "event",
      makeEvent({ category: "network", label: "GET /nearby 200", data: { method: "GET", url: "/nearby", status: 200 } }),
    );
    await flush();

    stdin.write("l");
    await flush();
    expect(lastFrame() ?? "").toContain("SWITCH LAYOUT");

    stdin.write("k"); // state-debug (active) -> network-debug
    await flush();
    stdin.write("\r");
    await flush();

    const frame = lastFrame() ?? "";
    expect(frame).toContain("API CALLS");
    expect(frame).toContain("QUERY CACHE");
    expect(frame).not.toContain("NAV / SCREEN"); // not part of Network Debug
    expect(frame).toContain("GET /nearby 200"); // event history survived the swap
  });

  it("a hand-built custom arrangement round-trips through the switcher (switch away, switch back, layout unchanged)", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("\t");
    await flush();
    stdin.write("\t"); // nav -> state -> api
    await flush();
    stdin.write("\x16"); // Ctrl+V splits API CALLS — arrangement now diverges from any preset ("custom")
    await flush();
    expect((lastFrame() ?? "").split("API CALLS")).toHaveLength(3); // two instances

    stdin.write("l");
    await flush();
    stdin.write("k"); // cursor starts on "Custom" -> move up to "Full"
    await flush();
    stdin.write("\r");
    await flush();
    expect((lastFrame() ?? "").split("API CALLS")).toHaveLength(2); // Full has a single API CALLS instance

    stdin.write("l");
    await flush();
    stdin.write("j"); // back down from "Full" to "Custom"
    await flush();
    stdin.write("\r");
    await flush();
    expect((lastFrame() ?? "").split("API CALLS")).toHaveLength(3); // custom split restored unchanged
  });

  it("s opens the settings menu; enter toggles selection stickiness, esc closes it", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
    await flush();

    stdin.write("s");
    await flush();
    let frame = lastFrame() ?? "";
    expect(frame).toContain("SETTINGS");
    expect(frame).toContain("Top"); // default

    stdin.write("\r"); // toggle
    await flush();
    frame = lastFrame() ?? "";
    expect(frame).toContain("Bottom");

    stdin.write("\x1b"); // esc closes back to the grid
    await flush();
    frame = lastFrame() ?? "";
    expect(frame).not.toContain("SETTINGS");
    expect(frame).toContain("NAV / SCREEN");
  });

  it("scroll stickiness defaults to top: the cursor pins to the first visible row, revealing newer events below it instead of only older ones above", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin, stdout } = render(<App server={server} metroTarget={null} />);
    stdoutRows(stdout, 28); // enough room for a 5-row visible window, see stdoutRows
    await flush();

    for (let i = 0; i < 30; i += 1) {
      server.emit("event", makeEvent({ label: `history-event-${i}` }));
      await flush();
    }

    for (let i = 0; i < 15; i += 1) {
      stdin.write("k"); // move selection up to roughly the middle of the list
      await flush();
    }

    const frame = lastFrame() ?? "";
    // selection is history-event-14 (29 - 15 moves); with the cursor pinned
    // to the FIRST visible row, the window extends into newer events below
    // it (event-18) instead of older ones above it (event-13, which is what
    // bottom-sticking would have shown instead)
    expect(frame).toContain("history-event-18");
    expect(frame).not.toContain("history-event-13");
  });

  it("toggling stickiness to Bottom restores the old behavior: the cursor pins to the last visible row", async () => {
    const server = new FakeServer();
    const { lastFrame, stdin, stdout } = render(<App server={server} metroTarget={null} />);
    stdoutRows(stdout, 28); // enough room for a 5-row visible window, see stdoutRows
    await flush();

    for (let i = 0; i < 30; i += 1) {
      server.emit("event", makeEvent({ label: `history-event-${i}` }));
      await flush();
    }

    stdin.write("s");
    await flush();
    stdin.write("\r"); // toggle default (Top) to Bottom
    await flush();
    stdin.write("\x1b");
    await flush();

    for (let i = 0; i < 15; i += 1) {
      stdin.write("k");
      await flush();
    }

    const frame = lastFrame() ?? "";
    // selection is history-event-14 again; with the cursor pinned to the
    // LAST visible row, the window trails into older events above it
    // (event-10) instead of newer ones below it (event-18)
    expect(frame).toContain("history-event-10");
    expect(frame).not.toContain("history-event-18");
  });
});
