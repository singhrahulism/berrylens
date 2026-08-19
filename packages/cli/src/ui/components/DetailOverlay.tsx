import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { JsonViewer } from "./JsonViewer";
import { CorrelationStrip } from "./CorrelationStrip";
import { CORRELATION_STRIP_ROWS, visibleRowsForGenericDetail } from "../layout";
import { GENERIC_DETAIL_BORDER_COLOR } from "../theme";
import type { DetailHandle } from "../keymap";

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
export const DetailOverlay = forwardRef<DetailHandle, DetailOverlayProps>(function DetailOverlay(
  { event, indexInfo, availableHeight, allEvents },
  ref,
) {
  const treeRef = useRef<DetailHandle>(null);
  useImperativeHandle(ref, () => ({
    handleDetailAction(action) {
      treeRef.current?.handleDetailAction(action);
    },
  }));

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor={GENERIC_DETAIL_BORDER_COLOR} paddingX={1}>
      <Text bold>
        {event.category.toUpperCase()} › {event.label}
      </Text>
      <Text dimColor>{new Date(event.timestamp).toISOString()}</Text>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        <JsonViewer ref={treeRef} key={event.id} data={event.data} maxVisibleRows={visibleRowsForGenericDetail(availableHeight)} />
      </Box>
      <Box marginTop={1}>
        <CorrelationStrip key={`${event.id}-nearby`} allEvents={allEvents} center={event} maxRows={CORRELATION_STRIP_ROWS} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>esc back   d dump to $EDITOR   n/p next/prev   {indexInfo}</Text>
      </Box>
    </Box>
  );
});
