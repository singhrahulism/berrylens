import React from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { JsonViewer } from "./JsonViewer.js";
import { CorrelationStrip } from "./CorrelationStrip.js";
import { CORRELATION_STRIP_ROWS, STATE_DIFF_ROWS, visibleRowsForStateDetail } from "../layout.js";

export interface StateDetailOverlayProps {
  event: InspectorEvent;
  indexInfo: string;
  availableHeight: number;
  allEvents: InspectorEvent[];
}

interface DiffEntry {
  from: unknown;
  to: unknown;
}

/**
 * State events with a captured `diff` (Redux/Zustand adapters) get old→new
 * per changed key up front — full snapshot is still available below via the
 * usual collapsible tree, but the diff is the actual point: "what changed",
 * not "here are two full trees, go compare them yourself".
 */
export function StateDetailOverlay({ event, indexInfo, availableHeight, allEvents }: StateDetailOverlayProps) {
  const diff = ((event.data as { diff?: Record<string, DiffEntry> }).diff ?? {}) as Record<string, DiffEntry>;
  const diffEntries = Object.entries(diff);
  const maxDiffRows = Math.max(0, STATE_DIFF_ROWS - 1);
  const shownDiff = diffEntries.slice(0, maxDiffRows);
  const hiddenDiffCount = diffEntries.length - shownDiff.length;

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor="magenta" paddingX={1}>
      <Text bold>
        {event.category.toUpperCase()} › {event.label}
      </Text>
      <Text dimColor>{new Date(event.timestamp).toISOString()}</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>
          CHANGED ({diffEntries.length}){hiddenDiffCount > 0 ? `  +${hiddenDiffCount} more` : ""}
        </Text>
        {shownDiff.length === 0 ? (
          <Text dimColor>  (no key-level diff captured)</Text>
        ) : (
          shownDiff.map(([key, entry]) => (
            <Text key={key}>
              {"  "}
              {key}  <Text dimColor>{formatValue(entry.from)}</Text>
              {"  →  "}
              <Text color="green">{formatValue(entry.to)}</Text>
            </Text>
          ))
        )}
      </Box>

      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        <Text bold dimColor>
          FULL STATE
        </Text>
        <JsonViewer key={event.id} data={event.data} maxVisibleRows={visibleRowsForStateDetail(availableHeight)} />
      </Box>

      <Box marginTop={1}>
        <CorrelationStrip
          key={`${event.id}-nearby`}
          allEvents={allEvents}
          center={event}
          maxRows={CORRELATION_STRIP_ROWS}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>esc back   d dump to $EDITOR   n/p next/prev   {indexInfo}</Text>
      </Box>
    </Box>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
