import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface ScrollableLinesProps {
  lines: string[];
  maxVisibleRows: number;
  active?: boolean;
}

/** A simple j/k-scrollable, height-bounded list of plain text lines — used for panel A (request overview). */
export function ScrollableLines({ lines, maxVisibleRows, active = true }: ScrollableLinesProps) {
  const [scroll, setScroll] = useState(0);
  const maxScroll = Math.max(0, lines.length - maxVisibleRows);
  const start = Math.max(0, Math.min(scroll, maxScroll));
  const visible = lines.slice(start, start + maxVisibleRows);

  useInput(
    (input, key) => {
      if (key.downArrow || input === "j") setScroll((s) => Math.min(maxScroll, s + 1));
      else if (key.upArrow || input === "k") setScroll((s) => Math.max(0, s - 1));
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column">
      {visible.map((line, index) => (
        <Text key={start + index}>{line}</Text>
      ))}
    </Box>
  );
}
