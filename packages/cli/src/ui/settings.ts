import type { AppState } from "./appState";

export interface SettingDefinition {
  id: string;
  label: string;
  value: (state: AppState) => string;
  toggle: (state: AppState) => AppState;
}

/** The settings menu's entries (`s`) — one today (scroll stickiness), more
 * can be appended here without changing `SettingsOverlay`/`keyHandler`'s
 * shape, same as `LAYOUT_PRESETS` for the layout switcher. */
export const SETTINGS: SettingDefinition[] = [
  {
    id: "scrollStickTop",
    label: "Selection stickiness",
    value: (state) => (state.scrollStickTop ? "Top" : "Bottom"),
    toggle: (state) => ({ ...state, scrollStickTop: !state.scrollStickTop }),
  },
];
