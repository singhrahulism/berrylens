import { describe, expect, it } from "vitest";
import { flattenVisibleNodes, ROOT_PATH } from "./json-tree";

describe("flattenVisibleNodes", () => {
  it("shows a leaf value as a single node", () => {
    const nodes = flattenVisibleNodes(42, new Set());
    expect(nodes).toEqual([{ path: "$", depth: 0, displayKey: "", isContainer: false, isExpanded: false, preview: "42" }]);
  });

  it("collapses an object by default (root not expanded)", () => {
    const nodes = flattenVisibleNodes({ a: 1, b: 2 }, new Set());
    expect(nodes).toHaveLength(1);
    expect(nodes[0].preview).toBe("{2 keys}");
    expect(nodes[0].isContainer).toBe(true);
    expect(nodes[0].isExpanded).toBe(false);
  });

  it("expands a container's direct children when its path is in expandedPaths", () => {
    const nodes = flattenVisibleNodes({ a: 1, b: "two" }, new Set([ROOT_PATH]));
    expect(nodes.map((n) => n.displayKey)).toEqual(["", "a", "b"]);
    expect(nodes[1].preview).toBe("1");
    expect(nodes[2].preview).toBe('"two"');
  });

  it("does not recurse into a nested container unless its own path is also expanded", () => {
    const nodes = flattenVisibleNodes({ nested: { x: 1 } }, new Set([ROOT_PATH]));
    expect(nodes.map((n) => n.path)).toEqual(["$", "$.nested"]);
    expect(nodes[1].preview).toBe("{1 key}");
  });

  it("recurses further once the nested path is expanded too", () => {
    const nodes = flattenVisibleNodes({ nested: { x: 1 } }, new Set([ROOT_PATH, "$.nested"]));
    expect(nodes.map((n) => n.path)).toEqual(["$", "$.nested", "$.nested.x"]);
  });

  it("indexes array items by position", () => {
    const nodes = flattenVisibleNodes([10, 20], new Set([ROOT_PATH]));
    expect(nodes.map((n) => n.displayKey)).toEqual(["", "0", "1"]);
    expect(nodes[0].preview).toBe("[2 items]");
  });

  it("formats null and undefined distinctly from other leaves", () => {
    expect(flattenVisibleNodes(null, new Set())[0].preview).toBe("null");
    expect(flattenVisibleNodes(undefined, new Set())[0].preview).toBe("undefined");
  });
});
