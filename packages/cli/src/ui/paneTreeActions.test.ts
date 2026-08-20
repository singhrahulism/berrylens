import { describe, expect, it } from "vitest";
import { initialState } from "./appState";
import { handlePaneTreeAction } from "./paneTreeActions";
import { closePane, collectLeaves, type PaneNode } from "./paneTree";

describe("open-view", () => {
  it("reopens the first missing default view, splitting off the focused pane", () => {
    // close GLOBAL STATE (the default focus is NAV, so close "state" directly)
    const withStateClosed = { ...initialState, paneTree: closePane(initialState.paneTree, "state")! };
    expect(collectLeaves(withStateClosed.paneTree).map((leaf) => leaf.viewId)).not.toContain("state");

    const result = handlePaneTreeAction(withStateClosed, { type: "open-view", direction: "row" });

    const leaves = collectLeaves(result.paneTree);
    expect(leaves.map((leaf) => leaf.viewId)).toContain("state");
    expect(result.focusedPaneId).toBe(leaves.find((leaf) => leaf.viewId === "state")!.id);
  });

  it("is a no-op when every default view already has an instance open", () => {
    const result = handlePaneTreeAction(initialState, { type: "open-view", direction: "row" });
    expect(result).toBe(initialState);
  });

  it("cycles to the next missing view in DEFAULT_PANES order when multiple are closed", () => {
    let tree = closePane(initialState.paneTree, "nav")!;
    tree = closePane(tree, "state")!;
    const state = { ...initialState, paneTree: tree, focusedPaneId: "api" };

    const first = handlePaneTreeAction(state, { type: "open-view", direction: "row" });
    expect(collectLeaves(first.paneTree).map((leaf) => leaf.viewId)).toContain("nav");
    expect(collectLeaves(first.paneTree).map((leaf) => leaf.viewId)).not.toContain("state");

    const second = handlePaneTreeAction(first, { type: "open-view", direction: "row" });
    expect(collectLeaves(second.paneTree).map((leaf) => leaf.viewId)).toContain("state");
  });

  it("honors the requested split direction (row vs. column)", () => {
    const withStateClosed = { ...initialState, paneTree: closePane(initialState.paneTree, "state")!, focusedPaneId: "nav" };

    const rowResult = handlePaneTreeAction(withStateClosed, { type: "open-view", direction: "row" });
    const rowSplit = findParentSplit(rowResult.paneTree, "nav");
    expect(rowSplit?.direction).toBe("row");

    const columnResult = handlePaneTreeAction(withStateClosed, { type: "open-view", direction: "column" });
    const columnSplit = findParentSplit(columnResult.paneTree, "nav");
    expect(columnSplit?.direction).toBe("column");
  });
});

function findParentSplit(node: PaneNode, leafId: string): { direction: "row" | "column" } | undefined {
  if (node.type === "leaf") return undefined;
  if (node.children.some((child) => child.type === "leaf" && child.id === leafId)) return node;
  for (const child of node.children) {
    const found = findParentSplit(child, leafId);
    if (found) return found;
  }
  return undefined;
}
