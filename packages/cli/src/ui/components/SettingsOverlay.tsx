import React from "react";
import { Box, Text } from "ink";
import { SETTINGS_BORDER_COLOR } from "../theme";

export interface SettingsRow {
  id: string;
  label: string;
  value: string;
}

export interface SettingsOverlayProps {
  rows: SettingsRow[];
  cursor: number;
}

/** Full-screen settings menu (`s`) — same list-and-select shape as
 * `LayoutSwitcherOverlay`: replaces the grid while active, `↑/↓`/`j/k` move,
 * `Enter`/`Space` toggles the highlighted row, `Esc` closes. One row today
 * (selection stickiness); add more to `settings.ts`'s `SETTINGS`, not a new
 * overlay or a bespoke interaction shape. */
export function SettingsOverlay({ rows, cursor }: SettingsOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor={SETTINGS_BORDER_COLOR} paddingX={1}>
      <Text bold>SETTINGS</Text>
      <Box flexDirection="column" flexGrow={1}>
        {rows.map((row, index) => (
          <Text key={row.id} inverse={index === cursor}>
            {row.label}: {row.value}
          </Text>
        ))}
      </Box>
      <Text dimColor>esc close   ↑/↓ move   enter/space toggle</Text>
    </Box>
  );
}
