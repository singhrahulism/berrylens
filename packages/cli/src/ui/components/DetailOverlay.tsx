import React from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { JsonViewer } from "./JsonViewer.js";
import { CorrelationStrip } from "./CorrelationStrip.js";
import { CORRELATION_STRIP_ROWS, visibleRowsForGenericDetail } from "../layout.js";

export interface DetailOverlayProps {
  event: InspectorEvent;
  indexInfo: string;
  /** Terminal rows available to the whole detail view, computed by the caller from live terminal height. */
  availableHeight: number;
  /** Full unfiltered event history, for the correlation strip — not just this pane's events. */
  allEvents: InspectorEvent[];
}

/**
 * Generic detail view — collapsible tree of `event.data` (raw JSON dump is
 * one `v` press away). Used for every category except network, which gets
 * the structured `NetworkDetailOverlay` instead. Renders in place of the
 * pane grid (not alongside it) so it always has the full terminal height.
 */
export function DetailOverlay({ event, indexInfo, availableHeight, allEvents }: DetailOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor="white" paddingX={1}>
      <Text bold>
        {event.category.toUpperCase()} › {event.label}
      </Text>
      <Text dimColor>{new Date(event.timestamp).toISOString()}</Text>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        <JsonViewer key={event.id} data={event.data} maxVisibleRows={visibleRowsForGenericDetail(availableHeight)} />
      </Box>
      <Box marginTop={1}>
        <CorrelationStrip key={`${event.id}-nearby`} allEvents={allEvents} center={event} maxRows={CORRELATION_STRIP_ROWS} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>esc back   d dump to $EDITOR   n/p next/prev   {indexInfo}</Text>
      </Box>
    </Box>
  );
}
