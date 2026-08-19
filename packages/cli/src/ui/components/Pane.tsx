import React from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { CATEGORY_COLORS, FOCUSED_BORDER_COLOR, UNFOCUSED_BORDER_COLOR } from "../theme";
import { computeScrollWindow } from "../layout";

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
  /** Time bounds of the currently selected event (or, if a range is active,
   * the whole range) in whichever OTHER pane is focused — rows within
   * [highlightFromTimestamp, highlightToTimestamp] get a `▸` marker, so
   * scrolling (or range-selecting) in one pane shows what else happened
   * across that span, across every other pane, without opening the detail
   * view. Not applied to the focused pane itself (it has its own selection
   * highlight). `highlightToTimestamp` unset means "at or after", open-ended. */
  highlightFromTimestamp?: number;
  highlightToTimestamp?: number;
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
  highlightFromTimestamp,
  highlightToTimestamp,
}: PaneProps) {
  const total = events.length;
  const selectedAbsoluteIndex = total - 1 - selectedIndexFromEnd;
  const { start, end } = computeScrollWindow(total, selectedAbsoluteIndex, visibleRows);
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
          const isOnOrAfter =
            !focused &&
            highlightFromTimestamp !== undefined &&
            event.timestamp >= highlightFromTimestamp &&
            (highlightToTimestamp === undefined || event.timestamp <= highlightToTimestamp);
          return (
            <Text key={event.id} color={CATEGORY_COLORS[event.category]} bold={isOnOrAfter} inverse={isSelected}>
              {isOnOrAfter ? "▸ " : "  "}
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
