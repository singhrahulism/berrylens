import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { flattenVisibleNodes, ROOT_PATH } from "../json-tree.js";
import { computeScrollWindow } from "../layout.js";

export interface JsonViewerProps {
  data: unknown;
  /** Set false if another sub-panel owns the keyboard instead (only one should be active at a time). */
  active?: boolean;
  /** How many content rows actually fit, computed by the caller from the live terminal height. */
  maxVisibleRows: number;
}

/**
 * Collapsible JSON tree (jless/fx-style), with a raw-JSON fallback — `v`
 * toggles between them. Root starts expanded one level, everything nested
 * starts collapsed, so a big payload doesn't dump as an unreadable wall of
 * text by default but nothing is hidden or truncated: it's all still there,
 * just collapsed until you ask for it. Both modes are windowed to
 * `maxVisibleRows` and scroll with the cursor — previously raw mode had no
 * height bound at all, so a long body just overflowed into the terminal's
 * own scroll rather than scrolling inside its own panel.
 */
export function JsonViewer({ data, active = true, maxVisibleRows }: JsonViewerProps) {
  const [mode, setMode] = useState<"tree" | "raw">("tree");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([ROOT_PATH]));
  const [cursorIndex, setCursorIndex] = useState(0);
  const [rawScroll, setRawScroll] = useState(0);

  const flatNodes = useMemo(() => flattenVisibleNodes(data, expandedPaths), [data, expandedPaths]);
  const clampedCursor = Math.max(0, Math.min(cursorIndex, flatNodes.length - 1));

  // JSON.stringify(undefined) returns the value `undefined`, not the string
  // "undefined" — .split would throw on it, so fall back explicitly.
  const rawLines = useMemo(() => (JSON.stringify(data, null, 2) ?? String(data)).split("\n"), [data]);
  const maxRawScroll = Math.max(0, rawLines.length - maxVisibleRows);
  const clampedRawScroll = Math.max(0, Math.min(rawScroll, maxRawScroll));

  useInput(
    (input, key) => {
      if (input === "v") {
        setMode((current) => (current === "tree" ? "raw" : "tree"));
        return;
      }

      if (mode === "raw") {
        if (key.downArrow || input === "j") setRawScroll((s) => Math.min(maxRawScroll, s + 1));
        else if (key.upArrow || input === "k") setRawScroll((s) => Math.max(0, s - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setCursorIndex((index) => Math.min(flatNodes.length - 1, index + 1));
        return;
      }
      if (key.upArrow || input === "k") {
        setCursorIndex((index) => Math.max(0, index - 1));
        return;
      }

      const current = flatNodes[clampedCursor];
      if (!current?.isContainer) return;

      if (key.return) {
        // enter toggles (expand if collapsed, collapse if already open) —
        // arrows stay directional (right=expand, left=collapse) for anyone
        // used to that convention, enter is the "just do the obvious thing" key
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(current.path)) next.delete(current.path);
          else next.add(current.path);
          return next;
        });
        return;
      }
      if (key.rightArrow || input === "l") {
        if (!current.isExpanded) setExpandedPaths((prev) => new Set(prev).add(current.path));
        return;
      }
      if ((key.leftArrow || input === "h") && current.isExpanded) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.delete(current.path);
          return next;
        });
      }
    },
    { isActive: active },
  );

  if (mode === "raw") {
    const scrolled = rawLines.length > maxVisibleRows;
    const windowLines = rawLines.slice(clampedRawScroll, clampedRawScroll + maxVisibleRows);
    return (
      <Box flexDirection="column">
        <Text dimColor>
          v tree view{scrolled ? `  ·  j/k scroll  (${clampedRawScroll + 1}-${clampedRawScroll + windowLines.length} of ${rawLines.length})` : ""}
        </Text>
        {windowLines.map((line, index) => (
          <Text key={clampedRawScroll + index}>{line}</Text>
        ))}
      </Box>
    );
  }

  const { start, end } = computeScrollWindow(flatNodes.length, clampedCursor, maxVisibleRows);
  const windowNodes = flatNodes.slice(start, end);
  const scrolled = flatNodes.length > maxVisibleRows;

  return (
    <Box flexDirection="column">
      <Text dimColor>
        v raw JSON · ↑/↓ move · →/←/enter expand/collapse{scrolled ? `  (${start + 1}-${end} of ${flatNodes.length})` : ""}
      </Text>
      {windowNodes.map((node, index) => (
        <Text key={node.path} inverse={start + index === clampedCursor}>
          {"  ".repeat(node.depth)}
          {node.isContainer ? (node.isExpanded ? "▾ " : "▸ ") : "  "}
          {node.displayKey ? `${node.displayKey}: ` : ""}
          {node.preview}
        </Text>
      ))}
    </Box>
  );
}
