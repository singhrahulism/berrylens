import React from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { CATEGORY_COLORS, FOCUSED_BORDER_COLOR, UNFOCUSED_BORDER_COLOR } from "../theme";
import { computeScrollWindow } from "../layout";
import { isEventHighlighted, type CrossPaneHighlight } from "../pinSelectors";

export interface PaneProps {
  title: string;
  events: InspectorEvent[];
  focused: boolean;
  /** 0 = most recent event — the moving end of the selection/range. */
  selectedIndexFromEnd: number;
  /** The OTHER end of a Shift+j/k range in THIS pane (only meaningful when
   * `focused` is true) — same from-end indexing as `selectedIndexFromEnd`.
   * When set, every row between it and the current selection (inclusive)
   * is shown selected, not just the single current row. */
  rangeAnchorFromEnd?: number;
  /** Explicit rows/columns computed by the caller — not flexGrow, which only
   * approximates the split and can drift from what Yoga actually renders
   * (visible as blank space at the bottom of a pane despite having more
   * events to show). Explicit sizing guarantees what we compute is exactly
   * what's on screen. */
  height: number;
  width: number;
  filterActive?: boolean;
  /** How many rows actually fit, computed from the live terminal height by the caller. */
  visibleRows: number;
  /** Settings-menu toggle (`s`) — which edge of the visible window the
   * selection sticks to while scrolling. Defaults to the original bottom-
   * sticking behavior. */
  scrollStickTop?: boolean;
  /** What drives the ▸ "at or after" / ◆ "pinned" markers — the live
   * selection (or range) in whichever pane is currently focused, or a
   * pinned event/range once `p` overrides it (see `crossPaneHighlight`).
   * The ▸ marker is suppressed in this pane while it's focused UNLESS a pin
   * is active — a live cursor's own pane has no need to mark itself, but a
   * pin is a persistent reference decoupled from focus, so it should keep
   * marking qualifying rows even in the pane you're currently looking at. */
  highlight: CrossPaneHighlight;
}

/** Pure/presentational — never touches the event bus directly, driven entirely by props. */
export function Pane({
  title,
  events,
  focused,
  selectedIndexFromEnd,
  rangeAnchorFromEnd,
  height,
  width,
  filterActive,
  visibleRows,
  scrollStickTop = false,
  highlight,
}: PaneProps) {
  const total = events.length;
  const selectedAbsoluteIndex = total - 1 - selectedIndexFromEnd;
  const { start, end } = computeScrollWindow(total, selectedAbsoluteIndex, visibleRows, scrollStickTop);
  const visible = events.slice(start, end);
  const scrolled = total > visibleRows;

  const anchorAbsoluteIndex = rangeAnchorFromEnd !== undefined ? total - 1 - rangeAnchorFromEnd : selectedAbsoluteIndex;
  const rangeLow = Math.min(selectedAbsoluteIndex, anchorAbsoluteIndex);
  const rangeHigh = Math.max(selectedAbsoluteIndex, anchorAbsoluteIndex);
  const rangeSize = rangeAnchorFromEnd !== undefined ? rangeHigh - rangeLow + 1 : undefined;

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      overflow="hidden"
      borderStyle="round"
      borderColor={focused ? FOCUSED_BORDER_COLOR : UNFOCUSED_BORDER_COLOR}
      paddingX={1}
    >
      <Text bold color={focused ? FOCUSED_BORDER_COLOR : undefined}>
        {title}
        {filterActive ? " (filtered)" : ""}
        {rangeSize !== undefined ? `  (range: ${rangeSize})` : ""}
        {scrolled ? `  (${start + 1}-${end} of ${total})` : ""}
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>—</Text>
      ) : (
        visible.map((event, index) => {
          const absoluteIndex = start + index;
          const isSelected = focused && absoluteIndex >= rangeLow && absoluteIndex <= rangeHigh;
          const suppressHighlight = focused && highlight.pinnedEventId === undefined;
          const isOnOrAfter = !suppressHighlight && isEventHighlighted(event, highlight);
          const isPinned = event.id === highlight.pinnedEventId || event.id === highlight.pinnedRangeAnchorId;
          return (
            <Text key={event.id} color={CATEGORY_COLORS[event.category]} bold={isOnOrAfter || isPinned} inverse={isSelected}>
              {isPinned ? "◆ " : isOnOrAfter ? "▸ " : "  "}
              {formatRow(event)}
            </Text>
          );
        })
      )}
    </Box>
  );
}

function formatRow(event: InspectorEvent): string {
  const time = new Date(event.timestamp).toISOString().slice(11, 23);
  const duration = event.durationMs !== undefined ? ` ${Math.round(event.durationMs)}ms` : "";
  return `${time}  ${event.label}${duration}`;
}
