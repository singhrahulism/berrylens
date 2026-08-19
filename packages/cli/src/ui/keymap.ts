import type { Key } from "ink";

export type Mode = "normal" | "filter" | "detail" | "search";

export type Action =
  | { type: "focus-next" }
  | { type: "focus-prev" }
  | { type: "move-selection"; direction: 1 | -1 }
  | { type: "extend-selection"; direction: 1 | -1 }
  | { type: "jump-live" }
  | { type: "grow" }
  | { type: "shrink" }
  | { type: "zoom-toggle" }
  | { type: "open-detail" }
  | { type: "close-detail" }
  | { type: "step-detail"; direction: 1 | -1 }
  | { type: "dump" }
  | { type: "curl" }
  | { type: "filter-start" }
  | { type: "filter-input"; value: string }
  | { type: "filter-backspace" }
  | { type: "filter-apply" }
  | { type: "filter-cancel" }
  | { type: "search-start" }
  | { type: "search-input"; value: string }
  | { type: "search-backspace" }
  | { type: "search-move"; direction: 1 | -1 }
  | { type: "search-select" }
  | { type: "search-cancel" }
  | { type: "clear" }
  | { type: "view-timeline" }
  | { type: "view-dashboard" }
  | DetailAction
  | { type: "quit" };

/**
 * Keystrokes that navigate *inside* an open detail view (the JSON tree, the
 * network A/B/C sub-panels, raw-JSON scroll) — resolved centrally here like
 * every other keybinding, but applied by whichever detail component is
 * currently mounted via `DetailHandle`, not dispatched through the reducer:
 * this is UI-local state (expand-paths, cursor, scroll offset), not app state.
 */
export type DetailAction =
  | { type: "detail-move"; direction: 1 | -1 }
  | { type: "detail-expand" }
  | { type: "detail-collapse" }
  | { type: "detail-toggle-node" }
  | { type: "detail-toggle-raw" }
  | { type: "detail-panel-focus"; direction: 1 | -1 };

const DETAIL_ACTION_TYPES = new Set<Action["type"]>([
  "detail-move",
  "detail-expand",
  "detail-collapse",
  "detail-toggle-node",
  "detail-toggle-raw",
  "detail-panel-focus",
]);

export function isDetailAction(action: Action): action is DetailAction {
  return DETAIL_ACTION_TYPES.has(action.type);
}

/** Implemented by every detail-view component (`DetailOverlay`,
 * `NetworkDetailOverlay`, `StateDetailOverlay`) via `useImperativeHandle`, so
 * `App.tsx`'s single `useInput` can forward a resolved `DetailAction` to
 * whichever one is currently mounted without either side reading raw keys. */
export interface DetailHandle {
  handleDetailAction(action: DetailAction): void;
}

/**
 * Single source of truth for keybindings, per mode — nothing else in the UI
 * interprets raw keypresses directly.
 */
export function resolveAction(mode: Mode, input: string, key: Key): Action | null {
  if (key.ctrl && input === "c") return { type: "quit" };

  if (mode === "filter") {
    if (key.return) return { type: "filter-apply" };
    if (key.escape) return { type: "filter-cancel" };
    if (key.backspace || key.delete) return { type: "filter-backspace" };
    if (input && !key.ctrl && !key.meta) return { type: "filter-input", value: input };
    return null;
  }

  if (mode === "search") {
    if (key.escape) return { type: "search-cancel" };
    if (key.return) return { type: "search-select" };
    if (key.upArrow) return { type: "search-move", direction: -1 };
    if (key.downArrow) return { type: "search-move", direction: 1 };
    if (key.backspace || key.delete) return { type: "search-backspace" };
    if (input && !key.ctrl && !key.meta) return { type: "search-input", value: input };
    return null;
  }

  if (mode === "detail") {
    if (key.escape) return { type: "close-detail" };
    if (key.tab && key.shift) return { type: "detail-panel-focus", direction: -1 };
    if (key.tab) return { type: "detail-panel-focus", direction: 1 };
    if (key.upArrow || input === "k") return { type: "detail-move", direction: -1 };
    if (key.downArrow || input === "j") return { type: "detail-move", direction: 1 };
    if (key.rightArrow || input === "l") return { type: "detail-expand" };
    if (key.leftArrow || input === "h") return { type: "detail-collapse" };
    if (key.return) return { type: "detail-toggle-node" };
    if (input === "v") return { type: "detail-toggle-raw" };
    if (input === "d") return { type: "dump" };
    if (input === "y") return { type: "curl" };
    if (input === "n") return { type: "step-detail", direction: 1 };
    if (input === "p") return { type: "step-detail", direction: -1 };
    if (input === "q") return { type: "quit" };
    return null;
  }

  // normal mode
  if (key.tab && key.shift) return { type: "focus-prev" };
  if (key.tab) return { type: "focus-next" };
  // Shift+arrow/J/K (range extend) must be checked before the plain
  // arrow/j/k checks below, since key.upArrow/downArrow are true either way
  // — only the shift-qualified branch should win when shift is held.
  if (key.upArrow && key.shift) return { type: "extend-selection", direction: -1 };
  if (key.downArrow && key.shift) return { type: "extend-selection", direction: 1 };
  if (input === "K") return { type: "extend-selection", direction: -1 };
  if (input === "J") return { type: "extend-selection", direction: 1 };
  if (key.upArrow || input === "k") return { type: "move-selection", direction: -1 };
  if (key.downArrow || input === "j") return { type: "move-selection", direction: 1 };
  if (input === "G") return { type: "jump-live" };
  if (input === "+" || input === "=") return { type: "grow" };
  if (input === "-" || input === "_") return { type: "shrink" };
  if (input === "z") return { type: "zoom-toggle" };
  if (key.return) return { type: "open-detail" };
  if (input === "/") return { type: "filter-start" };
  if (input === "?") return { type: "search-start" };
  if (input === "c") return { type: "clear" };
  if (input === "T" || input === "t") return { type: "view-timeline" };
  if (input === "D" || input === "d") return { type: "view-dashboard" };
  if (input === "q") return { type: "quit" };
  return null;
}
