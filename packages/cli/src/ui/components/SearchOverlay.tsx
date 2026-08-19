import React from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { CATEGORY_COLORS, SEARCH_BORDER_COLOR } from "../theme";
import { computeScrollWindow } from "../layout";

export interface SearchOverlayProps {
  query: string;
  matches: InspectorEvent[];
  cursor: number;
  maxVisibleRows: number;
}

/** Full-screen, cross-category search — replaces the grid while active, same as the detail view. */
export function SearchOverlay({ query, matches, cursor, maxVisibleRows }: SearchOverlayProps) {
  const clampedCursor = Math.max(0, Math.min(cursor, matches.length - 1));
  const { start, end } = computeScrollWindow(matches.length, clampedCursor, maxVisibleRows);
  const visible = matches.slice(start, end);
  const scrolled = matches.length > maxVisibleRows;

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor={SEARCH_BORDER_COLOR} paddingX={1}>
      <Text bold>SEARCH (all categories)</Text>
      <Text>
        {"> "}
        {query}
        <Text inverse> </Text>
      </Text>
      <Text dimColor>
        {matches.length} match{matches.length === 1 ? "" : "es"}
        {scrolled ? `  (${start + 1}-${end} of ${matches.length})` : ""}
      </Text>
      <Box flexDirection="column" flexGrow={1}>
        {visible.length === 0 ? (
          <Text dimColor>{query ? "  no matches" : "  type to search labels, categories, and full payloads..."}</Text>
        ) : (
          visible.map((event, index) => (
            <Text key={event.id} color={CATEGORY_COLORS[event.category]} inverse={start + index === clampedCursor}>
              {new Date(event.timestamp).toISOString().slice(11, 23)}  {event.category.padEnd(10)} {event.label}
            </Text>
          ))
        )}
      </Box>
      <Text dimColor>esc cancel   ↑/↓ move   enter open detail</Text>
    </Box>
  );
}
