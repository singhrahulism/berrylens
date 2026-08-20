import { describe, expect, it } from "vitest";
import { initialState } from "./appState";
import { handleKey } from "./keyHandler";
import { SETTINGS } from "./settings";

// Only the settings-menu cursor is covered directly here (App.test.tsx can't
// usefully assert on cursor position while SETTINGS has a single entry —
// every row always renders highlighted). Everything else `handleKey`
// dispatches is covered end-to-end via App.test.tsx per this repo's usual
// testing convention.
describe("handleKey: settings menu", () => {
  it("s opens the menu with the cursor on the first row", () => {
    const state = handleKey(initialState, "s", {} as never);
    expect(state.mode).toBe("settings");
    expect(state.settingsCursor).toBe(0);
  });

  it("settings-move clamps within SETTINGS' bounds instead of running off either end", () => {
    const opened = handleKey(initialState, "s", {} as never);
    const movedDown = handleKey(opened, "j", {} as never);
    expect(movedDown.settingsCursor).toBe(Math.min(SETTINGS.length - 1, 1));

    const movedUp = handleKey({ ...opened, settingsCursor: 0 }, "k", {} as never);
    expect(movedUp.settingsCursor).toBe(0); // can't go below the first row
  });

  it("enter toggles whichever setting is under the cursor", () => {
    const before = SETTINGS[0].value(initialState);
    const inSettingsMode = { ...initialState, mode: "settings" as const, settingsCursor: 0 };
    const toggled = handleKey(inSettingsMode, "", { return: true } as never);
    expect(SETTINGS[0].value(toggled)).not.toBe(before);
  });
});
