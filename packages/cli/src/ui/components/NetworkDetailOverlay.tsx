import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { InspectorEvent } from "@berrylens/protocol";
import { JsonViewer } from "./JsonViewer.js";
import { ScrollableLines } from "./ScrollableLines.js";
import { CorrelationStrip } from "./CorrelationStrip.js";
import { CORRELATION_STRIP_ROWS, computeNetworkDetailLayout } from "../layout.js";
import { FOCUSED_BORDER_COLOR, UNFOCUSED_BORDER_COLOR } from "../theme.js";

export interface NetworkDetailOverlayProps {
  event: InspectorEvent;
  indexInfo: string;
  /** Terminal rows available to the whole detail view, computed by the caller from live terminal height. */
  availableHeight: number;
  /** Full unfiltered event history, for the correlation strip — not just this pane's events. */
  allEvents: InspectorEvent[];
}

interface NetworkEventData {
  method?: string;
  url?: string;
  status?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: string;
}

type SubPanel = "A" | "B" | "C";
const PANEL_ORDER: SubPanel[] = ["A", "B", "C"];

/**
 * Three-panel layout: A (request overview: method/url/status/duration +
 * request headers) takes the top 25% of height, full width; B and C split
 * the remaining 75% side by side. `Tab` cycles keyboard focus between them —
 * only the focused panel's scroll/tree handler is active, so a key never
 * gets handled by two panels at once. Each panel is independently windowed
 * to its own computed height, so a long response body scrolls inside its
 * own panel rather than pushing the whole terminal into scroll.
 */
export function NetworkDetailOverlay({ event, indexInfo, availableHeight, allEvents }: NetworkDetailOverlayProps) {
  const [focusedPanel, setFocusedPanel] = useState<SubPanel>("C");
  const data = event.data as NetworkEventData;
  const layout = computeNetworkDetailLayout(availableHeight);

  useInput((_input, key) => {
    if (key.tab) setFocusedPanel((current) => nextPanel(current, key.shift));
  });

  const hasRequestBody = data.requestBody !== undefined;
  const panelBTitle = hasRequestBody ? "REQUEST BODY" : "QUERY PARAMS";
  const panelBData = hasRequestBody ? data.requestBody : parseQueryParams(data.url);

  const requestLines = buildRequestOverviewLines(event, data);
  const hasResponseHeaders = Boolean(data.responseHeaders && Object.keys(data.responseHeaders).length > 0);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor="cyan" paddingX={1}>
      <Box
        flexDirection="column"
        height={layout.requestPanelRows}
        overflow="hidden"
        borderStyle="round"
        borderColor={panelBorderColor(focusedPanel === "A")}
        paddingX={1}
      >
        <Text bold color={panelBorderColor(focusedPanel === "A")}>
          REQUEST
        </Text>
        <ScrollableLines lines={requestLines} maxVisibleRows={layout.requestContentRows} active={focusedPanel === "A"} />
      </Box>

      <Box flexDirection="row" height={layout.bodyPanelRows} overflow="hidden">
        <Box
          flexDirection="column"
          flexGrow={1}
          overflow="hidden"
          borderStyle="round"
          borderColor={panelBorderColor(focusedPanel === "B")}
          paddingX={1}
        >
          <Text bold color={panelBorderColor(focusedPanel === "B")}>
            {panelBTitle}
          </Text>
          <JsonViewer
            key={`${event.id}-b`}
            data={panelBData}
            maxVisibleRows={layout.bodyContentRows}
            active={focusedPanel === "B"}
          />
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          overflow="hidden"
          borderStyle="round"
          borderColor={panelBorderColor(focusedPanel === "C")}
          paddingX={1}
        >
          <Text bold color={panelBorderColor(focusedPanel === "C")}>
            RESPONSE{data.status !== undefined ? ` (${data.status})` : ""}
          </Text>
          {hasResponseHeaders ? <Text dimColor>headers: {JSON.stringify(data.responseHeaders)}</Text> : null}
          <JsonViewer
            key={`${event.id}-c`}
            data={data.responseBody}
            maxVisibleRows={layout.bodyContentRows - (hasResponseHeaders ? 1 : 0)}
            active={focusedPanel === "C"}
          />
        </Box>
      </Box>

      <Box marginTop={0}>
        <CorrelationStrip
          key={`${event.id}-nearby`}
          allEvents={allEvents}
          center={event}
          maxRows={CORRELATION_STRIP_ROWS}
        />
      </Box>

      <Text dimColor>esc back   tab switch panel   d dump   y curl   n/p next/prev   {indexInfo}</Text>
    </Box>
  );
}

function nextPanel(current: SubPanel, backwards?: boolean): SubPanel {
  const index = PANEL_ORDER.indexOf(current);
  const delta = backwards ? -1 : 1;
  return PANEL_ORDER[(index + delta + PANEL_ORDER.length) % PANEL_ORDER.length];
}

function panelBorderColor(isFocused: boolean): string {
  return isFocused ? FOCUSED_BORDER_COLOR : UNFOCUSED_BORDER_COLOR;
}

/** Query-params fallback for panel B when there's no captured request body (the common GET case). */
function parseQueryParams(url: string | undefined): Record<string, string> | string {
  if (!url) return "(no query params)";
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return "(no query params)";
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const entries = Object.fromEntries(params.entries());
  return Object.keys(entries).length > 0 ? entries : "(no query params)";
}

function buildRequestOverviewLines(event: InspectorEvent, data: NetworkEventData): string[] {
  const lines: string[] = [];
  lines.push(`${data.method ?? ""} ${data.url ?? ""}`.trim());
  const statusPart = data.status !== undefined ? `status: ${data.status}` : "status: —";
  const durationPart = event.durationMs !== undefined ? `duration: ${Math.round(event.durationMs)}ms` : "";
  lines.push([statusPart, durationPart].filter(Boolean).join("   "));
  if (data.error) lines.push(`error: ${data.error}`);
  lines.push("");
  lines.push("request headers:");
  const headers = data.requestHeaders;
  if (headers && Object.keys(headers).length > 0) {
    for (const [key, value] of Object.entries(headers)) lines.push(`  ${key}: ${value}`);
  } else {
    lines.push("  (none)");
  }
  return lines;
}
