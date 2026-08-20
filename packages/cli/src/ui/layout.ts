import type { PaneNode } from "./paneTree";

/**
 * Grid resize math. "+"/"-" adjust an Ink flexbox `flexGrow` value directly —
 * this is the terminal-app equivalent of drag-resizing a pane (true mouse-drag
 * resize isn't realistic in a terminal; keyboard-driven resize is, same as
 * tmux/k9s/btop).
 */
export const MIN_GROW = 0.3;
export const MAX_GROW = 5;
export const GROW_STEP = 0.5;

export function growRatio(current: number): number {
  return clamp(round(current + GROW_STEP));
}

export function shrinkRatio(current: number): number {
  return clamp(round(current - GROW_STEP));
}

function clamp(value: number): number {
  return Math.min(MAX_GROW, Math.max(MIN_GROW, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Terminal-height-aware row sizing. Previously each pane just showed a
 * hardcoded last-8 rows regardless of actual space, which either wasted
 * space or (on a shorter terminal) got silently clipped to fewer visible
 * rows than that with zero indication why — computing real available rows
 * per pane from the live terminal height fixes both.
 */
export const PANE_CHROME_ROWS = 3; // title line + top border + bottom border
export const STATUS_BAR_ROWS = 1;
export const FOOTER_ROWS = 1;

/**
 * Proportional integer split of `total` by `weights` — used for both row
 * heights and pane widths (same math either way: distribute a total size by
 * weighted shares). Flooring each share independently can lose rows/columns
 * entirely (e.g. floor(22/3) three times = 21, not 22) — that's a real bug,
 * not just cosmetic: it means the grid's rows never actually summed to the
 * full available height, which is what caused blank space at the bottom of
 * panes even with more events to show. The leftover from flooring is instead
 * handed out one unit at a time to whichever buckets had the largest
 * fractional remainder, so the result always sums to exactly `total`.
 */
export function computeProportionalSizes(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const raw = weights.map((weight) => (total * weight) / totalWeight);
  const sizes = raw.map((value) => Math.max(1, Math.floor(value)));
  let remainder = total - sizes.reduce((sum, value) => sum + value, 0);

  if (remainder > 0) {
    const byRemainingFraction = raw
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);
    for (let i = 0; i < byRemainingFraction.length && remainder > 0; i += 1, remainder -= 1) {
      sizes[byRemainingFraction[i].index] += 1;
    }
  }

  return sizes;
}

export function visibleRowsForPaneHeight(paneHeight: number): number {
  return Math.max(1, paneHeight - PANE_CHROME_ROWS);
}

/**
 * Windowed scrolling: given a cursor position and how many rows actually
 * fit, returns the [start, end) slice that keeps the cursor visible. Reused
 * by pane lists, the JSON tree, and the network detail sub-panels — the
 * fix for "scrolling up stops revealing history": before this, panes always
 * rendered `events.slice(-visibleRows)` regardless of cursor position, so
 * moving the cursor past the tail window just clamped the highlight at the
 * edge instead of ever sliding the window to show older items.
 * `stickToTop` (settings-menu toggle) flips which edge the selection hugs:
 * false (default) pins it to the last visible row, true to the first.
 */
export function computeScrollWindow(
  total: number,
  selectedIndex: number,
  visibleRows: number,
  stickToTop = false,
): { start: number; end: number } {
  if (total <= visibleRows) return { start: 0, end: total };
  const clampedSelected = Math.max(0, Math.min(total - 1, selectedIndex));
  const maxStart = total - visibleRows;
  const desiredStart = stickToTop ? clampedSelected : clampedSelected - visibleRows + 1;
  const start = Math.max(0, Math.min(maxStart, desiredStart));
  return { start, end: start + visibleRows };
}

/**
 * Chrome accounting for the generic (non-network) full-screen detail view:
 * outer border (2) + category/label line (1) + timestamp line (1) +
 * margin before content (1) + margin before footer (1) + footer line (1).
 */
export const GENERIC_DETAIL_CHROME_ROWS = 7;

/**
 * The correlation strip ("what else happened around this event") — 1 header
 * line + up to 4 nearby events, deliberately small since it's a glance-strip,
 * not another scrollable panel.
 */
export const CORRELATION_STRIP_ROWS = 5;
export const CORRELATION_WINDOW_MS = 500;

/**
 * The state-diff summary ("CHANGED" section) — 1 header + up to 5 changed
 * keys shown old→new before the full state tree below it.
 */
export const STATE_DIFF_ROWS = 6;

export function visibleRowsForStateDetail(availableHeight: number): number {
  return Math.max(1, availableHeight - GENERIC_DETAIL_CHROME_ROWS - CORRELATION_STRIP_ROWS - STATE_DIFF_ROWS);
}

export function visibleRowsForGenericDetail(availableHeight: number): number {
  return Math.max(1, availableHeight - GENERIC_DETAIL_CHROME_ROWS - CORRELATION_STRIP_ROWS);
}

/**
 * Layout for the network detail view's A/B/C split: A (request overview)
 * takes the top 25% of height, full width; B and C split the remaining 75%
 * side by side. Each sub-panel additionally loses its own border (2) + title
 * line (1) to get its actual scrollable content budget.
 */
export const NETWORK_DETAIL_OUTER_CHROME_ROWS = 3; // outer border (2) + footer line (1)
export const SUB_PANEL_CHROME_ROWS = 3; // border (2) + title line (1)
export const REQUEST_PANEL_HEIGHT_RATIO = 0.25;

export interface NetworkDetailLayout {
  requestPanelRows: number;
  requestContentRows: number;
  bodyPanelRows: number;
  bodyContentRows: number;
}

/**
 * Chrome for the global search overlay: outer border (2) + title line (1) +
 * input line (1) + match-count line (1) + footer line (1).
 */
export const SEARCH_CHROME_ROWS = 6;

export function visibleRowsForSearch(availableHeight: number): number {
  return Math.max(1, availableHeight - SEARCH_CHROME_ROWS);
}

export function computeNetworkDetailLayout(availableHeight: number): NetworkDetailLayout {
  const inner = Math.max(1, availableHeight - NETWORK_DETAIL_OUTER_CHROME_ROWS - CORRELATION_STRIP_ROWS);
  const requestPanelRows = Math.max(4, Math.floor(inner * REQUEST_PANEL_HEIGHT_RATIO));
  const bodyPanelRows = Math.max(1, inner - requestPanelRows);
  return {
    requestPanelRows,
    requestContentRows: Math.max(1, requestPanelRows - SUB_PANEL_CHROME_ROWS),
    bodyPanelRows,
    bodyContentRows: Math.max(1, bodyPanelRows - SUB_PANEL_CHROME_ROWS),
  };
}

export interface PaneRect {
  id: string;
  viewId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Recursive geometry over a `PaneNode` tree (Phase 11), reusing
 * `computeProportionalSizes` for each split — the abstract-coordinate twin
 * of `Dashboard.tsx`'s nested-Box rendering (kept separate from it since Ink
 * has no precedent for absolute-positioned rendering in this codebase; this
 * exists for geometric reasoning, not to be rendered directly). */
export function computePaneTreeLayout(node: PaneNode, x: number, y: number, width: number, height: number): PaneRect[] {
  if (node.type === "leaf") return [{ id: node.id, viewId: node.viewId, x, y, width, height }];
  const sizes = computeProportionalSizes(node.direction === "row" ? width : height, node.weights);
  const rects: PaneRect[] = [];
  let offset = 0;
  node.children.forEach((child, index) => {
    const size = sizes[index];
    rects.push(
      ...(node.direction === "row"
        ? computePaneTreeLayout(child, x + offset, y, size, height)
        : computePaneTreeLayout(child, x, y + offset, width, size)),
    );
    offset += size;
  });
  return rects;
}

export type FocusDirection = "left" | "right" | "up" | "down";

/** Nearest leaf in the given direction, by center-to-center distance among
 * candidates that actually lie on that side — computed over an abstract
 * coordinate space (not the real terminal size), since only relative
 * position/ordering matters here, not exact pixels. */
export function findDirectionalNeighbor(tree: PaneNode, fromId: string, direction: FocusDirection): string | undefined {
  const rects = computePaneTreeLayout(tree, 0, 0, 1000, 1000);
  const from = rects.find((rect) => rect.id === fromId);
  if (!from) return undefined;
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;

  let best: PaneRect | undefined;
  let bestDistance = Infinity;
  for (const rect of rects) {
    if (rect.id === fromId) continue;
    const dx = rect.x + rect.width / 2 - fromCenterX;
    const dy = rect.y + rect.height / 2 - fromCenterY;
    const onSide =
      (direction === "left" && dx < -1) ||
      (direction === "right" && dx > 1) ||
      (direction === "up" && dy < -1) ||
      (direction === "down" && dy > 1);
    if (!onSide) continue;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = rect;
    }
  }
  return best?.id;
}
