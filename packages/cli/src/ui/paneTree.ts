import { DEFAULT_LAYOUT } from "./paneConfig";
import { computeProportionalSizes } from "./layout";

export type SplitDirection = "row" | "column";

export interface PaneLeaf {
  type: "leaf";
  /** Unique instance id — distinct from `viewId` once a view has been split more than once. */
  id: string;
  /** Which `PaneDefinition` (from `paneConfig.ts`) this instance renders. */
  viewId: string;
}

export interface PaneSplit {
  type: "split";
  /** "row" = children side by side (a vertical dividing line); "column" = children stacked. */
  direction: SplitDirection;
  children: PaneNode[];
  /** Parallel to `children` — same weighted-share meaning as `computeProportionalSizes`. */
  weights: number[];
}

export type PaneNode = PaneLeaf | PaneSplit;

/** Sane ceiling on how far splitting can go — panes below a useful size stop
 * being a productive workspace, and an unbounded tree has no other natural stop. */
export const MAX_PANES = 9;

function leaf(viewId: string): PaneLeaf {
  return { type: "leaf", id: viewId, viewId };
}

/** The 5-pane default grid, expressed as a tree — built from `DEFAULT_LAYOUT`
 * so the "which panes go where" data isn't duplicated in two places. */
export function buildDefaultPaneTree(): PaneNode {
  const rows: PaneNode[] = DEFAULT_LAYOUT.map((row) =>
    row.paneIds.length > 1
      ? { type: "split", direction: "row", children: row.paneIds.map(leaf), weights: row.paneIds.map(() => 1) }
      : leaf(row.paneIds[0]),
  );
  return { type: "split", direction: "column", children: rows, weights: rows.map(() => 1) };
}

export function collectLeaves(node: PaneNode): PaneLeaf[] {
  return node.type === "leaf" ? [node] : node.children.flatMap(collectLeaves);
}

export function countLeaves(node: PaneNode): number {
  return node.type === "leaf" ? 1 : node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function findLeafViewId(node: PaneNode, id: string): string | undefined {
  return collectLeaves(node).find((candidate) => candidate.id === id)?.viewId;
}

/** Next unique instance id for a split of `viewId` — `viewId` itself if that
 * view has no instance yet, otherwise `viewId-2`, `viewId-3`, ... Deterministic
 * from the tree's current contents, no external counter needed. */
export function nextInstanceId(tree: PaneNode, viewId: string): string {
  const existing = new Set(collectLeaves(tree).map((candidate) => candidate.id));
  if (!existing.has(viewId)) return viewId;
  let n = 2;
  while (existing.has(`${viewId}-${n}`)) n += 1;
  return `${viewId}-${n}`;
}

/** Replaces the leaf `targetId` with a split containing it and `newLeaf`.
 * No-op (returns `tree` unchanged) if `targetId` isn't found or the tree is
 * already at `MAX_PANES` — a guardrail against runaway splitting rather than
 * a crash. */
export function splitPane(tree: PaneNode, targetId: string, direction: SplitDirection, newLeaf: PaneLeaf): PaneNode {
  if (countLeaves(tree) >= MAX_PANES) return tree;
  if (tree.type === "leaf") {
    return tree.id === targetId ? { type: "split", direction, children: [tree, newLeaf], weights: [1, 1] } : tree;
  }
  let changed = false;
  const children = tree.children.map((child) => {
    const next = splitPane(child, targetId, direction, newLeaf);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...tree, children } : tree;
}

/** Removes the leaf `targetId`. Returns `null` if that would close the last
 * remaining pane (caller treats `null` as a no-op signal, not a crash). A
 * split left with only one child collapses into that child directly, so the
 * tree never accumulates single-child splits. */
export function closePane(tree: PaneNode, targetId: string): PaneNode | null {
  if (tree.type === "leaf") return tree.id === targetId ? null : tree;
  const children: PaneNode[] = [];
  const weights: number[] = [];
  tree.children.forEach((child, index) => {
    if (child.type === "leaf" && child.id === targetId) return; // dropped
    const result = child.type === "leaf" ? child : closePane(child, targetId);
    if (result === null) return; // whole subtree collapsed away
    children.push(result);
    weights.push(tree.weights[index]);
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...tree, children, weights };
}

/** Adjusts the weight of whichever split directly parents `leafId` — walks
 * down until `leafId` is found as a direct child, which naturally reproduces
 * the old "resize the row" vs. "resize the pane within its row" distinction
 * without needing to special-case single-pane rows. */
export function adjustWeightForLeaf(node: PaneNode, leafId: string, transform: (weight: number) => number): PaneNode {
  if (node.type === "leaf") return node;
  const index = node.children.findIndex((child) => child.type === "leaf" && child.id === leafId);
  if (index !== -1) {
    const weights = [...node.weights];
    weights[index] = transform(weights[index]);
    return { ...node, weights };
  }
  return { ...node, children: node.children.map((child) => adjustWeightForLeaf(child, leafId, transform)) };
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

