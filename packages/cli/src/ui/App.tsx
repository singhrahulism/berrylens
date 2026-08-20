import React, { useEffect, useReducer, useRef } from "react";
import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import type { HelloMessage, InspectorEvent } from "@berrylens/protocol";
import type { ConnectionInfo, InspectorServer } from "../server";
import type { MetroTarget } from "../metroPairing";
import { FOOTER_ROWS, STATUS_BAR_ROWS, visibleRowsForSearch } from "./layout";
import { isDetailAction, resolveAction, type DetailHandle } from "./keymap";
import { focusedPaneDefinition, hasDiff, initialState, listForPane, positiveOr } from "./appState";
import { reducer } from "./reducer";
import { performDetailCurlExport, performDetailDump } from "./detailKeyEffects";
import { Dashboard } from "./components/Dashboard";
import { DetailOverlay } from "./components/DetailOverlay";
import { NetworkDetailOverlay } from "./components/NetworkDetailOverlay";
import { StateDetailOverlay } from "./components/StateDetailOverlay";
import { StatusBar } from "./components/StatusBar";
import { findGlobalMatches } from "./views/search";
import { SearchOverlay } from "./components/SearchOverlay";

const STATUS_MESSAGE_DURATION_MS = 4000;
const ERROR_FLASH_DURATION_MS = 2500;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_COLUMNS = 80;

export interface AppProps {
  server: Pick<InspectorServer, "on" | "off" | "getHistory">;
  metroTarget: MetroTarget | null;
}

export function App({ server, metroTarget }: AppProps) {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const { stdout } = useStdout();
  const [state, dispatch] = useReducer(reducer, initialState);
  const detailRef = useRef<DetailHandle>(null);

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
      performDetailDump(state, setRawMode);
      return;
    }

    if (resolved.type === "curl" && state.mode === "detail") {
      const message = performDetailCurlExport(state);
      if (message) {
        dispatch({ kind: "status", message });
        setTimeout(() => dispatch({ kind: "status", message: null }), STATUS_MESSAGE_DURATION_MS);
      }
      return;
    }

    if (isDetailAction(resolved)) {
      detailRef.current?.handleDetailAction(resolved);
      return;
    }

    dispatch({ kind: "key", input, key });
  });

  const focusedPane = focusedPaneDefinition(state);
  const focusedList = focusedPane ? listForPane(state, focusedPane, state.focusedPaneId) : [];
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
          ref={detailRef}
          event={detailEvent}
          indexInfo={`${focusedList.length - (state.selectedFromEnd[state.focusedPaneId] ?? 0)} of ${focusedList.length}`}
          availableHeight={Math.max(1, terminalRows - STATUS_BAR_ROWS)}
          allEvents={state.events}
        />
      ) : (
        <Dashboard
          state={state}
          gridHeight={gridHeight}
          terminalColumns={terminalColumns}
          highlightFrom={highlightFrom}
          highlightTo={highlightTo}
        />
      )}
      {!inDetailMode && !inSearchMode && (
        <Box paddingX={1}>
          {state.mode === "filter" ? (
            <Text>/ {state.filterText}</Text>
          ) : (
            <Text dimColor>
              Tab/Ctrl+arrow focus · j/k scroll · J/K extend range · +/- resize · Ctrl+V/B split · Ctrl+W close pane ·
              Ctrl+N/O reopen closed pane (vert/horiz) · z zoom · enter detail · / filter pane · ? search all ·
              {state.view === "timeline" ? " d dashboard" : " t timeline"} · c clear · q quit
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
