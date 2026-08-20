import { describe, expect, it } from "vitest";
import {
  MAX_PANES,
  adjustWeightForLeaf,
  buildDefaultPaneTree,
  closePane,
  collectLeaves,
  countLeaves,
  findLeafViewId,
  nextInstanceId,
  splitPane,
  type PaneLeaf,
  type PaneNode,
} from "./paneTree";

function leaf(id: string): PaneLeaf {
  return { type: "leaf", id, viewId: id };
}

describe("buildDefaultPaneTree", () => {
  it("matches the default 5-pane grid's focus order (nav, state, api, query, console)", () => {
    expect(collectLeaves(buildDefaultPaneTree()).map((l) => l.id)).toEqual(["nav", "state", "api", "query", "console"]);
  });
});

describe("splitPane", () => {
  it("replaces a leaf with a split containing both the original and the new leaf", () => {
    const tree = splitPane(leaf("a"), "a", "row", leaf("b"));
    expect(tree).toEqual({ type: "split", direction: "row", children: [leaf("a"), leaf("b")], weights: [1, 1] });
  });

  it("splits at arbitrary depth — a leaf nested inside an existing split", () => {
    const tree: PaneNode = { type: "split", direction: "column", children: [leaf("a"), leaf("b")], weights: [1, 1] };
    const result = splitPane(tree, "b", "row", leaf("c"));
    expect(countLeaves(result)).toBe(3);
    expect(collectLeaves(result).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when the target id doesn't exist", () => {
    const tree = leaf("a");
    expect(splitPane(tree, "missing", "row", leaf("b"))).toBe(tree);
  });

  it("is a no-op once MAX_PANES is reached (guardrail, not a crash)", () => {
    let tree: PaneNode = leaf("p0");
    for (let i = 1; i < MAX_PANES; i += 1) tree = splitPane(tree, `p${i - 1}`, "row", leaf(`p${i}`));
    expect(countLeaves(tree)).toBe(MAX_PANES);
    const attempt = splitPane(tree, "p0", "row", leaf("overflow"));
    expect(attempt).toBe(tree);
    expect(countLeaves(attempt)).toBe(MAX_PANES);
  });
});

describe("closePane", () => {
  it("returns null when closing the last remaining pane (no-op signal, not a crash)", () => {
    expect(closePane(leaf("a"), "a")).toBeNull();
  });

  it("collapses a two-child split down to the surviving child", () => {
    const tree: PaneNode = { type: "split", direction: "row", children: [leaf("a"), leaf("b")], weights: [1, 2] };
    expect(closePane(tree, "b")).toEqual(leaf("a"));
  });

  it("removes one leaf from a deeper split and restores sibling space (fewer children, same node)", () => {
    const tree: PaneNode = {
      type: "split",
      direction: "column",
      children: [{ type: "split", direction: "row", children: [leaf("a"), leaf("b"), leaf("c")], weights: [1, 1, 1] }, leaf("d")],
      weights: [1, 1],
    };
    const result = closePane(tree, "b");
    expect(collectLeaves(result!).map((l) => l.id)).toEqual(["a", "c", "d"]);
    const row = (result as { children: PaneNode[] }).children[0] as { children: PaneNode[]; weights: number[] };
    expect(row.children).toHaveLength(2);
    expect(row.weights).toEqual([1, 1]);
  });

  it("is a no-op (returns the same tree) when the target id doesn't exist", () => {
    const tree: PaneNode = { type: "split", direction: "row", children: [leaf("a"), leaf("b")], weights: [1, 1] };
    expect(closePane(tree, "missing")).toEqual(tree);
  });
});

describe("adjustWeightForLeaf", () => {
  it("adjusts the weight on the leaf's direct parent split, leaving other splits untouched", () => {
    const tree: PaneNode = {
      type: "split",
      direction: "column",
      children: [{ type: "split", direction: "row", children: [leaf("a"), leaf("b")], weights: [1, 1] }, leaf("c")],
      weights: [1, 1],
    };
    const result = adjustWeightForLeaf(tree, "a", (w) => w + 0.5) as { children: PaneNode[]; weights: number[] };
    const row = result.children[0] as { weights: number[] };
    expect(row.weights).toEqual([1.5, 1]);
    expect(result.weights).toEqual([1, 1]); // the outer column split is untouched
  });

  it("adjusts the top-level split's weight for a leaf with no sibling row (single-pane row case)", () => {
    const tree = buildDefaultPaneTree();
    const result = adjustWeightForLeaf(tree, "api", (w) => w + 1) as { children: PaneNode[]; weights: number[] };
    expect(result.weights).toEqual([1, 2, 1]); // api is the sole child of the middle row
  });
});

describe("nextInstanceId", () => {
  it("returns the view id itself when no instance of it exists yet", () => {
    expect(nextInstanceId(leaf("b"), "a")).toBe("a");
  });

  it("returns a numbered id once the view id is already taken", () => {
    const tree: PaneNode = { type: "split", direction: "row", children: [leaf("a"), leaf("b")], weights: [1, 1] };
    expect(nextInstanceId(tree, "a")).toBe("a-2");
  });

  it("skips already-taken numbered ids", () => {
    const tree: PaneNode = {
      type: "split",
      direction: "row",
      children: [leaf("a"), { type: "leaf", id: "a-2", viewId: "a" }],
      weights: [1, 1],
    };
    expect(nextInstanceId(tree, "a")).toBe("a-3");
  });
});

describe("findLeafViewId", () => {
  it("resolves a split-created instance id back to its view id", () => {
    const tree: PaneNode = {
      type: "split",
      direction: "row",
      children: [leaf("a"), { type: "leaf", id: "a-2", viewId: "a" }],
      weights: [1, 1],
    };
    expect(findLeafViewId(tree, "a-2")).toBe("a");
  });
});
