import React, { useEffect, useReducer, useRef } from "react";
import { Box, Text, useApp, useInput, useStdin, useStdout } from "ink";
import type { HelloMessage, InspectorEvent } from "@berrylens/protocol";
import type { ConnectionInfo, InspectorServer } from "../server";
import type { MetroTarget } from "../metroPairing";
import { STATUS_BAR_ROWS, visibleRowsForSearch, wrappedLineCount } from "./layout";
import { isDetailAction, resolveAction, type DetailHandle } from "./keymap";
import { focusedPaneDefinition, hasDiff, initialState, listForPane, positiveOr } from "./appState";
import { crossPaneHighlight } from "./pinSelectors";
import { reducer } from "./reducer";
import { performDetailCurlExport, performDetailDump } from "./detailKeyEffects";
import { Dashboard } from "./components/Dashboard";
import { DetailOverlay } from "./components/DetailOverlay";
import { NetworkDetailOverlay } from "./components/NetworkDetailOverlay";
import { StateDetailOverlay } from "./components/StateDetailOverlay";
import { StatusBar } from "./components/StatusBar";
import { findGlobalMatches } from "./views/search";
import { SearchOverlay } from "./components/SearchOverlay";
import { layoutOptions } from "./layoutPresets";
import { LayoutSwitcherOverlay } from "./components/LayoutSwitcherOverlay";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { SETTINGS } from "./settings";

const STATUS_MESSAGE_DURATION_MS = 4000;
const ERROR_FLASH_DURATION_MS = 2500;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_COLUMNS = 80;

/** The exact string the footer renders — kept as one source of truth so the
 * `wrappedLineCount` sizing check and the actual `<Text>` content can never
 * drift apart (see `wrappedLineCount`'s doc comment for why that matters). */
function footerHintText(view: "dashboard" | "timeline"): string {
  return (
    "Tab/Ctrl+arrow focus · j/k scroll · J/K extend range · h/g newest/oldest · H/G newest/oldest highlighted · " +
    "+/- resize · Ctrl+V/B split · Ctrl+W close pane · Ctrl+N/O reopen closed pane (vert/horiz) · z zoom · " +
    "l layout · s settings · p pin · enter detail · / filter pane · ? search all · " +
    (view === "timeline" ? "d dashboard" : "t timeline") +
    " · c clear · q quit"
  );
}

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
  const highlight = crossPaneHighlight(state);

  // `??` alone isn't enough here: some terminals/ptys report rows/columns as
  // `0` (not `undefined`) transiently (e.g. mid-resize), which `??` doesn't
  // treat as missing — and a `0` height on the root container collapses the
  // entire app to nothing rather than falling back sensibly.
  const terminalRows = positiveOr(stdout?.rows, DEFAULT_TERMINAL_ROWS);
  const terminalColumns = positiveOr(stdout?.columns, DEFAULT_TERMINAL_COLUMNS);

  const inDetailMode = state.mode === "detail" && detailEvent;
  const inSearchMode = state.mode === "search";
  const inLayoutMode = state.mode === "layout";
  const inSettingsMode = state.mode === "settings";
  // the footer (and therefore its actual row count) only ever renders
  // alongside the grid, in these same two remaining modes
  const footerVisible = !inDetailMode && !inSearchMode && !inLayoutMode && !inSettingsMode;
  const footerText = state.mode === "filter" ? `/ ${state.filterText}` : footerHintText(state.view);
  const footerRows = footerVisible ? wrappedLineCount(footerText, Math.max(1, terminalColumns - 2)) : 0;
  const gridHeight = Math.max(1, terminalRows - STATUS_BAR_ROWS - footerRows);

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
        pinnedLabel={highlight.statusLabel}
      />
      {inSearchMode ? (
        <SearchOverlay
          query={state.searchQuery}
          matches={searchMatches}
          cursor={state.searchCursor}
          maxVisibleRows={visibleRowsForSearch(Math.max(1, terminalRows - STATUS_BAR_ROWS))}
        />
      ) : inLayoutMode ? (
        <LayoutSwitcherOverlay
          options={layoutOptions(Boolean(state.customPaneTree))}
          cursor={state.layoutCursor}
          activeId={state.layoutPresetId}
        />
      ) : inSettingsMode ? (
        <SettingsOverlay
          rows={SETTINGS.map((setting) => ({ id: setting.id, label: setting.label, value: setting.value(state) }))}
          cursor={state.settingsCursor}
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
        <Dashboard state={state} gridHeight={gridHeight} terminalColumns={terminalColumns} highlight={highlight} />
      )}
      {footerVisible && (
        <Box paddingX={1}>
          <Text dimColor={state.mode !== "filter"}>{footerText}</Text>
        </Box>
      )}
    </Box>
  );
}
