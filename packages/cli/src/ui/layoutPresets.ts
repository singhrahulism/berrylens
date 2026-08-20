import { buildDefaultPaneTree, type PaneNode, type SplitDirection } from "./paneTree";

export interface LayoutPreset {
  id: string;
  label: string;
  buildTree: () => PaneNode;
}

export interface LayoutOption {
  id: string;
  label: string;
}

function leaf(viewId: string): PaneNode {
  return { type: "leaf", id: viewId, viewId };
}

function split(direction: SplitDirection, children: PaneNode[]): PaneNode {
  return { type: "split", direction, children, weights: children.map(() => 1) };
}

/** Three built-in layout presets (Phase 12, `full.md` §4), each expressible
 * with Phase 11's pane tree. A "Performance" preset is deliberately skipped —
 * it depends on the deferred perf inspector. */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "network-debug",
    label: "Network Debug",
    buildTree: () => split("column", [split("row", [leaf("api"), leaf("query")]), leaf("console")]),
  },
  {
    // Identical to `buildDefaultPaneTree()` — kept as its own preset id
    // (rather than aliasing "default") so the switcher always has a stable
    // entry for "today's default grid" even if a future phase changes what
    // `buildDefaultPaneTree` returns.
    id: "state-debug",
    label: "State Debug",
    buildTree: buildDefaultPaneTree,
  },
  {
    id: "full",
    label: "Full",
    buildTree: () =>
      split("column", [
        split("row", [leaf("nav"), leaf("state")]),
        split("row", [leaf("api"), leaf("query")]),
        split("row", [leaf("console"), leaf("storage"), leaf("native")]),
      ]),
  },
];

/** The switcher's full option list — built-in presets plus "Custom" (the
 * developer's own hand-built split/close arrangement from Phase 11), which
 * only appears once one actually exists. */
export function layoutOptions(hasCustom: boolean): LayoutOption[] {
  const base = LAYOUT_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }));
  return hasCustom ? [...base, { id: "custom", label: "Custom" }] : base;
}
