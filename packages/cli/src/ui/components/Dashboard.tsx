import React from "react";
import { Box } from "ink";
import { DEFAULT_LAYOUT, DEFAULT_PANES, TIMELINE_PANE, paneById } from "../paneConfig";
import { computeProportionalSizes, visibleRowsForPaneHeight } from "../layout";
import { eventsForPane, listForPane, type AppState } from "../appState";
import { Pane } from "./Pane";

export interface DashboardProps {
  state: AppState;
  gridHeight: number;
  terminalColumns: number;
  rowHeights: number[];
  highlightFrom?: number;
  highlightTo?: number;
}

/** Whichever of the three mutually-exclusive dashboard views is active
 * (full-screen timeline, a zoomed single pane, or the default multi-pane
 * grid) — never combined, same rule as the detail/search overlays this
 * replaces in `App.tsx`. */
export function Dashboard({ state, gridHeight, terminalColumns, rowHeights, highlightFrom, highlightTo }: DashboardProps) {
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

  if (state.view === "timeline") {
    return (
      <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
        {renderTimelinePane(terminalColumns, gridHeight, visibleRowsForPaneHeight(gridHeight))}
      </Box>
    );
  }

  if (state.zoomedPaneId) {
    return (
      <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
        {renderPane(state.zoomedPaneId, terminalColumns, gridHeight, visibleRowsForPaneHeight(gridHeight))}
      </Box>
    );
  }

  return (
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
  );
}
