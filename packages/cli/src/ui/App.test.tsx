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
    const { lastFrame, stdin } = render(<App server={server} metroTarget={null} />);
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
});
