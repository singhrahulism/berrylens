import { describe, expect, it } from "vitest";
import {
  computeProportionalSizes,
  visibleRowsForPaneHeight,
  growRatio,
  shrinkRatio,
  computeScrollWindow,
  computeNetworkDetailLayout,
} from "./layout";

describe("computeProportionalSizes", () => {
  it("splits evenly when it divides cleanly", () => {
    expect(computeProportionalSizes(30, [1, 1, 1])).toEqual([10, 10, 10]);
  });

  it("gives a larger share to a resized bucket", () => {
    expect(computeProportionalSizes(30, [2, 1, 1])).toEqual([15, 8, 7]);
  });

  it("never returns less than 1 for a bucket even on a tiny terminal", () => {
    expect(computeProportionalSizes(2, [1, 1, 1])).toEqual([1, 1, 1]);
  });

  it("always sums to exactly the total when it divides unevenly — the actual bug fix", () => {
    // this is what caused blank space at the bottom of panes: flooring each
    // bucket independently (22/3 -> 7,7,7) silently lost a row that nothing
    // ever got, so the grid never summed to the full available height
    const sizes = computeProportionalSizes(22, [1, 1, 1]);
    expect(sizes.reduce((sum, value) => sum + value, 0)).toBe(22);
  });

  it("hands the leftover to the buckets with the largest fractional remainder", () => {
    // 22/3 = 7.33 each; two buckets should get the extra row, not just one
    // arbitrary one, and not the same bucket twice
    const sizes = computeProportionalSizes(22, [1, 1, 1]);
    expect(sizes.filter((value) => value === 8)).toHaveLength(1);
    expect(sizes.filter((value) => value === 7)).toHaveLength(2);
  });
});

describe("visibleRowsForPaneHeight", () => {
  it("subtracts title + border chrome", () => {
    expect(visibleRowsForPaneHeight(10)).toBe(7);
  });

  it("floors at 1 rather than going negative on a very short pane", () => {
    expect(visibleRowsForPaneHeight(1)).toBe(1);
  });
});

describe("growRatio / shrinkRatio", () => {
  it("grows and shrinks by a fixed step, clamped", () => {
    expect(growRatio(1)).toBe(1.5);
    expect(shrinkRatio(1)).toBe(0.5);
    expect(shrinkRatio(0.3)).toBe(0.3);
  });
});

describe("computeScrollWindow", () => {
  it("shows everything when it all fits", () => {
    expect(computeScrollWindow(5, 4, 8)).toEqual({ start: 0, end: 5 });
  });

  it("keeps the tail window when the selection is the most recent item", () => {
    expect(computeScrollWindow(30, 29, 8)).toEqual({ start: 22, end: 30 });
  });

  it("slides the window up as the selection scrolls into older history", () => {
    // this is the actual bug fix: scrolling up must reveal earlier items,
    // not just clamp the highlight at the edge of a fixed tail slice
    expect(computeScrollWindow(30, 19, 8)).toEqual({ start: 12, end: 20 });
  });

  it("never scrolls past the start", () => {
    expect(computeScrollWindow(30, 0, 8)).toEqual({ start: 0, end: 8 });
  });
});

describe("computeNetworkDetailLayout", () => {
  it("gives panel A roughly 25% of the inner height, B/C the rest", () => {
    // availableHeight 48 -> inner 40 (minus outer chrome 3, minus correlation strip 5) -> A: 10, BC: 30
    const layout = computeNetworkDetailLayout(48);
    expect(layout.requestPanelRows).toBe(10);
    expect(layout.bodyPanelRows).toBe(30);
  });

  it("subtracts each sub-panel's own border+title chrome for its content budget", () => {
    const layout = computeNetworkDetailLayout(48);
    expect(layout.requestContentRows).toBe(layout.requestPanelRows - 3);
    expect(layout.bodyContentRows).toBe(layout.bodyPanelRows - 3);
  });

  it("never collapses panel A below a usable floor on a short terminal", () => {
    const layout = computeNetworkDetailLayout(10);
    expect(layout.requestPanelRows).toBeGreaterThanOrEqual(4);
  });
});
