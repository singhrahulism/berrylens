import { describe, expect, it } from "vitest";
import { ALL_CATEGORIES, GRID_PANES, paneById } from "./paneConfig";
import { LAYOUT_PRESETS, layoutOptions } from "./layoutPresets";
import { buildDefaultPaneTree, collectLeaves } from "./paneTree";

describe("LAYOUT_PRESETS", () => {
  it("every leaf's viewId resolves to a real grid pane", () => {
    for (const preset of LAYOUT_PRESETS) {
      for (const leaf of collectLeaves(preset.buildTree())) {
        expect(paneById(GRID_PANES, leaf.viewId)).toBeDefined();
      }
    }
  });

  it("state-debug matches today's default grid exactly", () => {
    const preset = LAYOUT_PRESETS.find((candidate) => candidate.id === "state-debug")!;
    expect(preset.buildTree()).toEqual(buildDefaultPaneTree());
  });

  it("full covers every category across its panes", () => {
    const preset = LAYOUT_PRESETS.find((candidate) => candidate.id === "full")!;
    const categories = new Set(
      collectLeaves(preset.buildTree()).flatMap((leaf) => paneById(GRID_PANES, leaf.viewId)!.categories),
    );
    for (const category of ALL_CATEGORIES) expect(categories.has(category)).toBe(true);
  });
});

describe("layoutOptions", () => {
  it("omits Custom until one exists", () => {
    expect(layoutOptions(false).map((option) => option.id)).not.toContain("custom");
  });

  it("includes Custom once one exists", () => {
    expect(layoutOptions(true).map((option) => option.id)).toContain("custom");
  });
});
