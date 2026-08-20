import { describe, expect, it } from "vitest";
import { initialState } from "./appState";
import { SETTINGS } from "./settings";

describe("SETTINGS", () => {
  it("toggle flips value() to the opposite string", () => {
    for (const setting of SETTINGS) {
      const before = setting.value(initialState);
      const after = setting.toggle(initialState);
      expect(setting.value(after)).not.toBe(before);
    }
  });

  it("toggle is idempotent-reversible (toggling twice restores the original value)", () => {
    for (const setting of SETTINGS) {
      const before = setting.value(initialState);
      const roundTripped = setting.toggle(setting.toggle(initialState));
      expect(setting.value(roundTripped)).toBe(before);
    }
  });
});
