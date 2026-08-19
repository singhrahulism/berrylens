import type { AppEvent, AppState } from "./appState";
import { handleKey } from "./keyHandler";

const MAX_EVENTS = 5000;

/** Top-level reducer — kept separate from `appState.ts` (which owns the
 * `AppState`/`AppEvent` types and pure selection helpers) and `keyHandler.ts`
 * (which owns keyboard-driven transitions) so neither of those two depends on
 * the other: this file is the only one that imports from both. */
export function reducer(state: AppState, action: AppEvent): AppState {
  switch (action.kind) {
    case "event": {
      const events = [...state.events, action.event];
      if (events.length > MAX_EVENTS) events.shift();
      return { ...state, events };
    }
    case "hello":
      return {
        ...state,
        connectionStatus: "connected",
        appInfo: { appName: action.message.appName, platform: action.message.platform },
      };
    case "disconnection":
      return { ...state, connectionStatus: "disconnected" };
    case "connection":
      return { ...state, remoteAddress: action.info.remoteAddress };
    case "key":
      return handleKey(state, action.input, action.key);
    case "status":
      return { ...state, statusMessage: action.message };
    case "error-flash":
      return { ...state, errorFlashActive: true };
    case "clear-error-flash":
      return { ...state, errorFlashActive: false };
    default:
      return state;
  }
}
