import React from "react";
import { Box } from "ink";
import { GRID_PANES, TIMELINE_PANE, paneById } from "../paneConfig";
import { computeProportionalSizes, visibleRowsForPaneHeight } from "../layout";
import { eventsForPane, listForPane, type AppState } from "../appState";
import { findLeafViewId, type PaneNode } from "../paneTree";
import { Pane } from "./Pane";

export interface DashboardProps {
  state: AppState;
  gridHeight: number;
  terminalColumns: number;
  highlightFrom?: number;
  highlightTo?: number;
}

/** Whichever of the three mutually-exclusive dashboard views is active
 * (full-screen timeline, a zoomed single pane, or the default multi-pane
 * grid) — never combined, same rule as the detail/search overlays this
 * replaces in `App.tsx`. */
export function Dashboard({ state, gridHeight, terminalColumns, highlightFrom, highlightTo }: DashboardProps) {
  function renderPane(instanceId: string, viewId: string, width: number, height: number, visibleRows: number) {
    const pane = paneById(GRID_PANES, viewId);
    if (!pane) return null;
    const list = eventsForPane(state.events, pane.categories, state.appliedFilters[instanceId]);
    const isFocused = state.focusedPaneId === instanceId;
    return (
      <Pane
        key={instanceId}
        title={pane.title}
        filterActive={Boolean(state.appliedFilters[instanceId])}
        events={list}
        focused={isFocused}
        selectedIndexFromEnd={state.selectedFromEnd[instanceId] ?? 0}
        rangeAnchorFromEnd={isFocused ? (state.rangeAnchor ?? undefined) : undefined}
        width={width}
        height={height}
        visibleRows={visibleRows}
        highlightFromTimestamp={isFocused ? undefined : highlightFrom}
        highlightToTimestamp={isFocused ? undefined : highlightTo}
        scrollStickTop={state.scrollStickTop}
      />
    );
  }

  /** Recursively renders the pane tree (Phase 11) — a split node becomes a
   * flex row/column of its children sized by `computeProportionalSizes`
   * over its weights, same math `+`/`-` resize already relied on for the
   * fixed 2-row grid, now applied at arbitrary depth. */
  function renderNode(node: PaneNode, width: number, height: number): React.ReactNode {
    if (node.type === "leaf") return renderPane(node.id, node.viewId, width, height, visibleRowsForPaneHeight(height));
    const sizes = computeProportionalSizes(node.direction === "row" ? width : height, node.weights);
    return (
      <Box key="split" flexDirection={node.direction === "row" ? "row" : "column"} width={width} height={height} overflow="hidden">
        {node.children.map((child, index) => {
          const childWidth = node.direction === "row" ? sizes[index] : width;
          const childHeight = node.direction === "column" ? sizes[index] : height;
          return (
            <Box key={index} width={childWidth} height={childHeight} overflow="hidden">
              {renderNode(child, childWidth, childHeight)}
            </Box>
          );
        })}
      </Box>
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
        scrollStickTop={state.scrollStickTop}
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
    const viewId = findLeafViewId(state.paneTree, state.zoomedPaneId);
    return (
      <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
        {viewId && renderPane(state.zoomedPaneId, viewId, terminalColumns, gridHeight, visibleRowsForPaneHeight(gridHeight))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={gridHeight} width={terminalColumns} overflow="hidden">
      {renderNode(state.paneTree, terminalColumns, gridHeight)}
    </Box>
  );
}
