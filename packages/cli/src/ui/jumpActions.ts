import { focusedPaneDefinition, listForPane, type AppState } from "./appState";
import { crossPaneHighlight, isEventHighlighted } from "./pinSelectors";

/** `g`/`h`/`G`/`H` — split out from `keyHandler.ts` purely to keep it under
 * the repo's ~200-line-per-source-file guideline, same reason `pinActions.ts`
 * exists; still the same reducer logic, just factored by size. */

/** `g` — jump to the oldest event in the focused pane (the mirror of the
 * existing `h`/jump-live, which jumps to the newest). */
export function handleJumpFirst(state: AppState): AppState {
  const pane = focusedPaneDefinition(state);
  if (!pane) return state;
  const list = listForPane(state, pane, state.focusedPaneId);
  if (list.length === 0) return state;
  return {
    ...state,
    selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: list.length - 1 },
    rangeAnchor: null,
  };
}

/** `G`/`H` — jump to the oldest/newest event *among the currently highlighted
 * ones* in the focused pane (reuses the exact same `isEventHighlighted`
 * predicate the ▸/◆ markers are rendered with, so these keys always land on
 * what you can actually see marked). No-op if nothing in this pane is
 * currently highlighted. */
function jumpToHighlighted(state: AppState, pickLast: boolean): AppState {
  const pane = focusedPaneDefinition(state);
  if (!pane) return state;
  const list = listForPane(state, pane, state.focusedPaneId);
  const highlight = crossPaneHighlight(state);
  const matches = list.filter((event) => isEventHighlighted(event, highlight));
  if (matches.length === 0) return state;
  const target = pickLast ? matches[matches.length - 1] : matches[0];
  const absoluteIndex = list.indexOf(target);
  return {
    ...state,
    selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: list.length - 1 - absoluteIndex },
    rangeAnchor: null,
  };
}

export function handleJumpHighlightedFirst(state: AppState): AppState {
  return jumpToHighlighted(state, false);
}

export function handleJumpHighlightedLast(state: AppState): AppState {
  return jumpToHighlighted(state, true);
}
