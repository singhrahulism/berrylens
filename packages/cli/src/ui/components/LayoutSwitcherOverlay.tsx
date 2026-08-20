import React from "react";
import { Box, Text } from "ink";
import type { LayoutOption } from "../layoutPresets";
import { LAYOUT_BORDER_COLOR } from "../theme";

export interface LayoutSwitcherOverlayProps {
  options: LayoutOption[];
  cursor: number;
  activeId: string;
}

/** Full-screen list-and-select overlay for switching pane-tree layouts
 * (Phase 12) — replaces the grid while active, same pattern as `SearchOverlay`. */
export function LayoutSwitcherOverlay({ options, cursor, activeId }: LayoutSwitcherOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor={LAYOUT_BORDER_COLOR} paddingX={1}>
      <Text bold>SWITCH LAYOUT</Text>
      <Box flexDirection="column" flexGrow={1}>
        {options.map((option, index) => (
          <Text key={option.id} inverse={index === cursor}>
            {option.id === activeId ? "* " : "  "}
            {option.label}
          </Text>
        ))}
      </Box>
      <Text dimColor>esc cancel   ↑/↓ move   enter select</Text>
    </Box>
  );
}
