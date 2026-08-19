import React, { useEffect, useReducer } from "react";
import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import type { Key } from "ink";
import type { Category, HelloMessage, InspectorEvent } from "@berrylens/protocol";
import type { ConnectionInfo, InspectorServer } from "../server.js";
import type { MetroTarget } from "../metroPairing.js";
import {
  ALL_PANES,
  DEFAULT_LAYOUT,
  DEFAULT_PANES,
  TIMELINE_PANE,
  focusOrder,
  paneById,
  rowIndexForPane,
  siblingsInRow,
  type PaneDefinition,
} from "./paneConfig.js";
import { sortEventsChronologically } from "./timeline.js";
import {
  FOOTER_ROWS,
  STATUS_BAR_ROWS,
  computeProportionalSizes,
  growRatio,
  shrinkRatio,
  visibleRowsForPaneHeight,
  visibleRowsForSearch,
} from "./layout.js";
import { resolveAction, type Mode } from "./keymap.js";
import { Pane } from "./components/Pane.js";
import { DetailOverlay } from "./components/DetailOverlay.js";
import { NetworkDetailOverlay } from "./components/NetworkDetailOverlay.js";
import { StateDetailOverlay } from "./components/StateDetailOverlay.js";
import { StatusBar } from "./components/StatusBar.js";
import { dumpEventToFile, dumpTextToFile, openInEditor } from "./dump.js";
import { buildCurlCommand, type NetworkEventDataForCurl } from "./curl.js";
import { copyToClipboard } from "./clipboard.js";
import { findGlobalMatches } from "./search.js";
import { SearchOverlay } from "./components/SearchOverlay.js";

const STATUS_MESSAGE_DURATION_MS = 4000;
const ERROR_FLASH_DURATION_MS = 2500;

const FOCUS_ORDER = focusOrder(DEFAULT_LAYOUT);
const MAX_EVENTS = 5000;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_COLUMNS = 80;

export interface AppProps {
  server: Pick<InspectorServer, "on" | "off" | "getHistory">;
  metroTarget: MetroTarget | null;
}

interface AppState {
  events: InspectorEvent[];
  connectionStatus: "waiting" | "connected" | "disconnected";
  appInfo: { appName: string; platform: string } | null;
  remoteAddress?: string;
  focusedPaneId: string;
  zoomedPaneId: string | null;
  growByKey: Record<string, number>;
  selectedFromEnd: Record<string, number>;
  mode: Mode;
  filterPaneId: string | null;
  filterText: string;
  appliedFilters: Record<string, string>;
  statusMessage: string | null;
  searchQuery: string;
  searchCursor: number;
  errorFlashActive: boolean;
  /** The OTHER end of a Shift+j/k range selection in the focused pane, from-end indexed
   * like `selectedFromEnd` — null when no range is active (plain single selection). */
  rangeAnchor: number | null;
  /** Top-level view: the dashboard grid, or the full-screen cross-category timeline (Phase 10). */
  view: "dashboard" | "timeline";
  /** `focusedPaneId` to restore when leaving the timeline view back to the dashboard. */
  savedFocusedPaneId: string;
}

type AppEvent =
  | { kind: "event"; event: InspectorEvent }
  | { kind: "hello"; message: HelloMessage }
  | { kind: "disconnection" }
  | { kind: "connection"; info: ConnectionInfo }
  | { kind: "key"; input: string; key: Key }
  | { kind: "status"; message: string | null }
  | { kind: "error-flash" }
  | { kind: "clear-error-flash" };

const initialState: AppState = {
  events: [],
  connectionStatus: "waiting",
  appInfo: null,
  remoteAddress: undefined,
  focusedPaneId: FOCUS_ORDER[0],
  zoomedPaneId: null,
  growByKey: {},
  selectedFromEnd: Object.fromEntries(DEFAULT_PANES.map((pane) => [pane.id, 0])),
  mode: "normal",
  filterPaneId: null,
  filterText: "",
  appliedFilters: {},
  statusMessage: null,
  searchQuery: "",
  searchCursor: 0,
  errorFlashActive: false,
  rangeAnchor: null,
  view: "dashboard",
  savedFocusedPaneId: FOCUS_ORDER[0],
};

export function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function eventsForPane(events: InspectorEvent[], categories: Category[], filter: string | undefined): InspectorEvent[] {
  let list = events.filter((event) => categories.includes(event.category));
  if (filter) {
    const needle = filter.toLowerCase();
    list = list.filter((event) => event.label.toLowerCase().includes(needle));
  }
  return list;
}

function hasDiff(event: InspectorEvent): boolean {
  const diff = (event.data as { diff?: unknown }).diff;
  return typeof diff === "object" && diff !== null && Object.keys(diff).length > 0;
}

/** Events for a given pane, chronologically sorted when it's the timeline
 * pseudo-pane (Phase 10) — every other pane's events are already in arrival
 * order, so this is a no-op for them; kept as one function so the ordering
 * used for on-screen rendering and for selection/detail-lookup math never
 * diverges. */
function listForPane(state: AppState, pane: PaneDefinition): InspectorEvent[] {
  const list = eventsForPane(state.events, pane.categories, state.appliedFilters[pane.id]);
  return pane.id === TIMELINE_PANE.id ? sortEventsChronologically(list) : list;
}

/** The event currently shown in the detail view — reused by both the dump and curl-export key handlers. */
function selectedDetailEvent(state: AppState): InspectorEvent | undefined {
  const pane = paneById(ALL_PANES, state.focusedPaneId);
  if (!pane) return undefined;
  const list = listForPane(state, pane);
  return list[list.length - 1 - (state.selectedFromEnd[state.focusedPaneId] ?? 0)];
}

function reducer(state: AppState, action: AppEvent): AppState {
  switch (action.kind) {
    case "event": {
      const events = [...state.events, action.event];
      if (events.length > MAX_EVENTS) events.shift();
      return { ...state, events };
    }
    case "hello":
      return {
        ...state,
        connectionStatus: "connected",
        appInfo: { appName: action.message.appName, platform: action.message.platform },
      };
    case "disconnection":
      return { ...state, connectionStatus: "disconnected" };
    case "connection":
      return { ...state, remoteAddress: action.info.remoteAddress };
    case "key":
      return handleKey(state, action.input, action.key);
    case "status":
      return { ...state, statusMessage: action.message };
    case "error-flash":
      return { ...state, errorFlashActive: true };
    case "clear-error-flash":
      return { ...state, errorFlashActive: false };
    default:
      return state;
  }
}

function handleKey(state: AppState, input: string, key: Key): AppState {
  const resolved = resolveAction(state.mode, input, key);
  if (!resolved) return state;

  switch (resolved.type) {
    case "focus-next": {
      const index = FOCUS_ORDER.indexOf(state.focusedPaneId);
      return { ...state, focusedPaneId: FOCUS_ORDER[(index + 1) % FOCUS_ORDER.length], rangeAnchor: null };
    }
    case "focus-prev": {
      const index = FOCUS_ORDER.indexOf(state.focusedPaneId);
      return {
        ...state,
        focusedPaneId: FOCUS_ORDER[(index - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length],
        rangeAnchor: null,
      };
    }
    case "move-selection": {
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      const current = state.selectedFromEnd[state.focusedPaneId] ?? 0;
      // up (-1) means "older", which increases the from-end offset — bounded
      // by the pane's actual event count, or this can climb past the oldest
      // event with nothing visible ever selected again (no upper bound was
      // the bug: "scrolling up doesn't stop at the first element")
      const next = Math.max(0, Math.min(list.length - 1, current - resolved.direction));
      return {
        ...state,
        selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: next },
        rangeAnchor: null,
      };
    }
    case "extend-selection": {
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      const current = state.selectedFromEnd[state.focusedPaneId] ?? 0;
      // first Shift+j/k in a fresh selection anchors the range at wherever
      // the cursor already was; subsequent presses just keep moving the
      // other end — the anchor only resets on a plain move/focus-change/clear
      const anchor = state.rangeAnchor ?? current;
      const next = Math.max(0, Math.min(list.length - 1, current - resolved.direction));
      return {
        ...state,
        selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: next },
        rangeAnchor: anchor,
      };
    }
    case "jump-live":
      return { ...state, selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: 0 }, rangeAnchor: null };
    case "grow":
    case "shrink": {
      const siblings = siblingsInRow(DEFAULT_LAYOUT, state.focusedPaneId);
      const key2 =
        siblings.length > 0 ? `pane:${state.focusedPaneId}` : `row:${rowIndexForPane(DEFAULT_LAYOUT, state.focusedPaneId)}`;
      const current = state.growByKey[key2] ?? 1;
      const updated = resolved.type === "grow" ? growRatio(current) : shrinkRatio(current);
      return { ...state, growByKey: { ...state.growByKey, [key2]: updated } };
    }
    case "zoom-toggle":
      return { ...state, zoomedPaneId: state.zoomedPaneId ? null : state.focusedPaneId };
    case "open-detail": {
      // don't switch to a detail view with nothing to show — a focused pane
      // with zero (filtered) events would otherwise silently do nothing
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      if (list.length === 0) return state;
      return { ...state, mode: "detail" };
    }
    case "close-detail":
      return { ...state, mode: "normal" };
    case "step-detail": {
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      const current = state.selectedFromEnd[state.focusedPaneId] ?? 0;
      const next = Math.min(Math.max(0, list.length - 1), Math.max(0, current + resolved.direction));
      return { ...state, selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: next } };
    }
    case "filter-start":
      return {
        ...state,
        mode: "filter",
        filterPaneId: state.focusedPaneId,
        filterText: state.appliedFilters[state.focusedPaneId] ?? "",
      };
    case "filter-input":
      return { ...state, filterText: state.filterText + resolved.value };
    case "filter-backspace":
      return { ...state, filterText: state.filterText.slice(0, -1) };
    case "filter-apply": {
      const appliedFilters = { ...state.appliedFilters };
      if (state.filterPaneId) {
        if (state.filterText) appliedFilters[state.filterPaneId] = state.filterText;
        else delete appliedFilters[state.filterPaneId];
      }
      return { ...state, mode: "normal", appliedFilters, filterPaneId: null, filterText: "" };
    }
    case "filter-cancel": {
      const appliedFilters = { ...state.appliedFilters };
      if (state.filterPaneId) delete appliedFilters[state.filterPaneId];
      return { ...state, mode: "normal", appliedFilters, filterPaneId: null, filterText: "" };
    }
    case "search-start":
      return { ...state, mode: "search", searchQuery: "", searchCursor: 0 };
    case "search-input":
      return { ...state, searchQuery: state.searchQuery + resolved.value, searchCursor: 0 };
    case "search-backspace":
      return { ...state, searchQuery: state.searchQuery.slice(0, -1), searchCursor: 0 };
    case "search-move": {
      const matches = findGlobalMatches(state.events, state.searchQuery);
      const next = Math.max(0, Math.min(matches.length - 1, state.searchCursor + resolved.direction));
      return { ...state, searchCursor: next };
    }
    case "search-cancel":
      return { ...state, mode: "normal", searchQuery: "", searchCursor: 0 };
    case "search-select": {
      const matches = findGlobalMatches(state.events, state.searchQuery);
      const selected = matches[state.searchCursor];
      if (!selected) return state;
      const pane = DEFAULT_PANES.find((candidate) => candidate.categories.includes(selected.category));
      if (!pane) return state;
      // ignore the target pane's own per-pane filter when locating the
      // index — a global search match should always be reachable even if
      // that pane currently has an unrelated filter active
      const list = eventsForPane(state.events, pane.categories, undefined);
      const absoluteIndex = list.findIndex((event) => event.id === selected.id);
      if (absoluteIndex === -1) return state;
      return {
        ...state,
        mode: "detail",
        focusedPaneId: pane.id,
        selectedFromEnd: { ...state.selectedFromEnd, [pane.id]: list.length - 1 - absoluteIndex },
        searchQuery: "",
        searchCursor: 0,
      };
    }
    case "clear":
      return { ...state, events: [], rangeAnchor: null };
    case "view-timeline":
      if (state.view === "timeline") return state;
      return {
        ...state,
        view: "timeline",
        savedFocusedPaneId: state.focusedPaneId,
        focusedPaneId: TIMELINE_PANE.id,
        rangeAnchor: null,
      };
    case "view-dashboard":
      if (state.view === "dashboard") return state;
      return {
        ...state,
        view: "dashboard",
        focusedPaneId: state.savedFocusedPaneId,
        rangeAnchor: null,
      };
    default:
      return state;
  }
}

export function App({ server, metroTarget }: AppProps) {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const { stdout } = useStdout();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const onEvent = (event: InspectorEvent) => {
      dispatch({ kind: "event", event });
      if (event.category === "error") {
        dispatch({ kind: "error-flash" });
        setTimeout(() => dispatch({ kind: "clear-error-flash" }), ERROR_FLASH_DURATION_MS);
      }
    };
    const onHello = (message: HelloMessage) => dispatch({ kind: "hello", message });
    const onDisconnection = () => dispatch({ kind: "disconnection" });
    const onConnection = (info: ConnectionInfo) => dispatch({ kind: "connection", info });

    server.on("event", onEvent);
    server.on("hello", onHello);
    server.on("disconnection", onDisconnection);
    server.on("connection", onConnection);

    for (const event of server.getHistory()) dispatch({ kind: "event", event });

    return () => {
      server.off("event", onEvent);
      server.off("hello", onHello);
      server.off("disconnection", onDisconnection);
      server.off("connection", onConnection);
    };
  }, [server]);

  useInput((input, key) => {
    const resolved = resolveAction(state.mode, input, key);
    if (!resolved) return;

    if (resolved.type === "quit") {
      exit();
      return;
    }

    if (resolved.type === "dump" && state.mode === "detail") {
      const selected = selectedDetailEvent(state);
      if (selected) {
        const filePath = dumpEventToFile(selected);
        setRawMode?.(false);
        openInEditor(filePath);
        setRawMode?.(true);
      }
      return;
    }

    if (resolved.type === "curl" && state.mode === "detail") {
      const selected = selectedDetailEvent(state);
      if (selected?.category === "network") {
        const curlCommand = buildCurlCommand(selected.data as NetworkEventDataForCurl);
        const filePath = dumpTextToFile(`curl-${selected.id}.sh`, curlCommand);
        const copied = copyToClipboard(curlCommand);
        dispatch({
          kind: "status",
          message: copied ? `curl copied to clipboard (also saved: ${filePath})` : `curl saved to ${filePath}`,
        });
        setTimeout(() => dispatch({ kind: "status", message: null }), STATUS_MESSAGE_DURATION_MS);
      }
      return;
    }

    dispatch({ kind: "key", input, key });
  });

  const focusedPane = paneById(ALL_PANES, state.focusedPaneId);
  const focusedList = focusedPane ? listForPane(state, focusedPane) : [];
  const detailEvent = focusedList[focusedList.length - 1 - (state.selectedFromEnd[state.focusedPaneId] ?? 0)];
  const rangeAnchorEvent =
    state.rangeAnchor !== null ? focusedList[focusedList.length - 1 - state.rangeAnchor] : undefined;
  // when a range is active, other panes get both bounds (inclusive); otherwise
  // just the single selected timestamp, open-ended (existing "at or after" behavior)
  const highlightFrom =
    rangeAnchorEvent && detailEvent ? Math.min(rangeAnchorEvent.timestamp, detailEvent.timestamp) : detailEvent?.timestamp;
  const highlightTo =
    rangeAnchorEvent && detailEvent ? Math.max(rangeAnchorEvent.timestamp, detailEvent.timestamp) : undefined;

  // `??` alone isn't enough here: some terminals/ptys report rows/columns as
  // `0` (not `undefined`) transiently (e.g. mid-resize), which `??` doesn't
  // treat as missing — and a `0` height on the root container collapses the
  // entire app to nothing rather than falling back sensibly.
  const terminalRows = positiveOr(stdout?.rows, DEFAULT_TERMINAL_ROWS);
  const terminalColumns = positiveOr(stdout?.columns, DEFAULT_TERMINAL_COLUMNS);
  const gridHeight = Math.max(1, terminalRows - STATUS_BAR_ROWS - FOOTER_ROWS);
  const rowHeights = computeProportionalSizes(
    gridHeight,
    DEFAULT_LAYOUT.map((_, rowIndex) => state.growByKey[`row:${rowIndex}`] ?? 1),
  );

  function renderPane(paneId: string, width: number, height: number, visibleRows: number) {
    const pane = paneById(DEFAULT_PANES, paneId);
    if (!pane) return null;
    const list = eventsForPane(state.events, pane.categories, state.appliedFilters[paneId]);
    const isFocused = state.focusedPaneId === paneId;
    return (
      <Pane
        key={paneId}
        title={pane.title}
        filterActive={Boolean(state.appliedFilters[paneId])}
        events={list}
        focused={isFocused}
        selectedIndexFromEnd={state.selectedFromEnd[paneId] ?? 0}
        rangeAnchorFromEnd={isFocused ? (state.rangeAnchor ?? undefined) : undefined}
        width={width}
        height={height}
        visibleRows={visibleRows}
        highlightFromTimestamp={isFocused ? undefined : highlightFrom}
        highlightToTimestamp={isFocused ? undefined : highlightTo}
      />
    );
  }

  function renderTimelinePane(width: number, height: number, visibleRows: number) {
    const list = listForPane(state, TIMELINE_PANE);
    return (
      <Pane
        key={TIMELINE_PANE.id}
        title={TIMELINE_PANE.title}
        filterActive={Boolean(state.appliedFilters[TIMELINE_PANE.id])}
        events={list}
        focused
        selectedIndexFromEnd={state.selectedFromEnd[TIMELINE_PANE.id] ?? 0}
        rangeAnchorFromEnd={state.rangeAnchor ?? undefined}
        width={width}
        height={height}
        visibleRows={visibleRows}
      />
    );
  }

  const inDetailMode = state.mode === "detail" && detailEvent;
  const inSearchMode = state.mode === "search";
  const DetailComponent =
    detailEvent?.category === "network"
      ? NetworkDetailOverlay
      : detailEvent?.category === "state" && hasDiff(detailEvent)
        ? StateDetailOverlay
        : DetailOverlay;
  const searchMatches = inSearchMode ? findGlobalMatches(state.events, state.searchQuery) : [];
  const errorCount = state.events.reduce((count, event) => (event.category === "error" ? count + 1 : count), 0);

  return (
    // Explicit, stable full-terminal height at all times (not just whatever
    // the current mode's content happens to add up to) — the detail view and
    // the grid have genuinely different total row counts, and giving Ink a
    // consistent canvas to diff against, rather than one that shifts across
    // that transition, avoids an occasional stale-repaint after Esc where the
    // old frame lingered until the next keypress forced a fresh diff.
    <Box flexDirection="column" width="100%" height={terminalRows} overflow="hidden">
      <StatusBar
        connectionStatus={state.connectionStatus}
        appInfo={state.appInfo}
        metroTarget={metroTarget}
        remoteAddress={state.remoteAddress}
        eventCount={state.events.length}
        statusMessage={state.statusMessage}
        errorCount={errorCount}
        errorFlashActive={state.errorFlashActive}
      />
      {inSearchMode ? (
        <SearchOverlay
          query={state.searchQuery}
          matches={searchMatches}
          cursor={state.searchCursor}
          maxVisibleRows={visibleRowsForSearch(Math.max(1, terminalRows - STATUS_BAR_ROWS))}
        />
      ) : inDetailMode ? (
        <DetailComponent
          event={detailEvent}
          indexInfo={`${focusedList.length - (state.selectedFromEnd[state.focusedPaneId] ?? 0)} of ${focusedList.length}`}
          availableHeight={Math.max(1, terminalRows - STATUS_BAR_ROWS)}
          allEvents={state.events}
        />
      ) : state.view === "timeline" ? (
        <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
          {renderTimelinePane(terminalColumns, gridHeight, visibleRowsForPaneHeight(gridHeight))}
        </Box>
      ) : state.zoomedPaneId ? (
        <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
          {renderPane(state.zoomedPaneId, terminalColumns, gridHeight, visibleRowsForPaneHeight(gridHeight))}
        </Box>
      ) : (
        <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
          {DEFAULT_LAYOUT.map((row, rowIndex) => {
            const rowHeight = rowHeights[rowIndex];
            const paneWidths =
              row.paneIds.length > 1
                ? computeProportionalSizes(
                    terminalColumns,
                    row.paneIds.map((paneId) => state.growByKey[`pane:${paneId}`] ?? 1),
                  )
                : [terminalColumns];
            return (
              <Box key={rowIndex} flexDirection="row" height={rowHeight} width={terminalColumns} overflow="hidden">
                {row.paneIds.map((paneId, paneIndex) =>
                  renderPane(paneId, paneWidths[paneIndex], rowHeight, visibleRowsForPaneHeight(rowHeight)),
                )}
              </Box>
            );
          })}
        </Box>
      )}
      {!inDetailMode && !inSearchMode && (
        <Box paddingX={1}>
          {state.mode === "filter" ? (
            <Text>/ {state.filterText}</Text>
          ) : (
            <Text dimColor>
              Tab focus · j/k scroll · J/K extend range · +/- resize · z zoom · enter detail · / filter pane · ? search all ·
              {state.view === "timeline" ? " d dashboard" : " t timeline"} · c clear · q quit
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
