import React from "react";
import { Box, Text } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { findNearbyEvents } from "../views/correlation";
import { CATEGORY_COLORS } from "../theme";
import { CORRELATION_WINDOW_MS } from "../layout";

export interface CorrelationStripProps {
  allEvents: InspectorEvent[];
  center: InspectorEvent;
  /** Total rows this strip may use, including its own header line. */
  maxRows: number;
}

/**
 * "What else happened around this" — everything across every category
 * within ±CORRELATION_WINDOW_MS, not just the current pane. This is the
 * tool's original premise (a causal chain in one glance instead of manually
 * eyeballing timestamps across 5 panes), so it's deliberately shown here
 * rather than requiring a separate view.
 */
export function CorrelationStrip({ allEvents, center, maxRows }: CorrelationStripProps) {
  const nearby = findNearbyEvents(allEvents, center, CORRELATION_WINDOW_MS);
  const maxEventRows = Math.max(0, maxRows - 1);
  const shown = nearby.slice(0, maxEventRows);
  const hiddenCount = nearby.length - shown.length;

  return (
    <Box flexDirection="column">
      <Text bold dimColor>
        NEARBY (±{CORRELATION_WINDOW_MS}ms){hiddenCount > 0 ? `  +${hiddenCount} more` : ""}
      </Text>
      {shown.length <= 1 ? (
        <Text dimColor>  (nothing else nearby)</Text>
      ) : (
        shown.map((item) => (
          <Text key={item.event.id} color={CATEGORY_COLORS[item.event.category]} bold={item.isCenter}>
            {item.isCenter ? "▶ " : "  "}
            {formatOffset(item.offsetMs).padStart(7)}  {item.event.category.padEnd(10)} {item.event.label}
          </Text>
        ))
      )}
    </Box>
  );
}

function formatOffset(ms: number): string {
  if (ms === 0) return "0ms";
  return `${ms > 0 ? "+" : ""}${Math.round(ms)}ms`;
}
