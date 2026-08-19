import React, { forwardRef, useImperativeHandle, useState } from "react";
import { Box, Text } from "ink";
import type { DetailHandle } from "../keymap";

export interface ScrollableLinesProps {
  lines: string[];
  maxVisibleRows: number;
}

/** A simple j/k-scrollable, height-bounded list of plain text lines — used for panel A (request overview).
 * Keeps its own scroll offset locally, but receives resolved keystrokes via `DetailHandle`
 * rather than reading input itself — the caller decides when this instance is the forwarding target. */
export const ScrollableLines = forwardRef<DetailHandle, ScrollableLinesProps>(function ScrollableLines(
  { lines, maxVisibleRows },
  ref,
) {
  const [scroll, setScroll] = useState(0);
  const maxScroll = Math.max(0, lines.length - maxVisibleRows);
  const start = Math.max(0, Math.min(scroll, maxScroll));
  const visible = lines.slice(start, start + maxVisibleRows);

  useImperativeHandle(ref, () => ({
    handleDetailAction(action) {
      if (action.type !== "detail-move") return;
      setScroll((s) => (action.direction === 1 ? Math.min(maxScroll, s + 1) : Math.max(0, s - 1)));
    },
  }));

  return (
    <Box flexDirection="column">
      {visible.map((line, index) => (
        <Text key={start + index}>{line}</Text>
      ))}
    </Box>
  );
});
