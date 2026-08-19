import type { Key } from "ink";
import {
  ALL_PANES,
  DEFAULT_LAYOUT,
  DEFAULT_PANES,
  FOCUS_ORDER,
  TIMELINE_PANE,
  paneById,
  rowIndexForPane,
  siblingsInRow,
} from "./paneConfig";
import { growRatio, shrinkRatio } from "./layout";
import { resolveAction } from "./keymap";
import { findGlobalMatches } from "./views/search";
import { eventsForPane, listForPane, type AppState } from "./appState";

/** Every keyboard-driven state transition in normal/filter/search mode —
 * split out from `appState.ts` purely to keep both files under the repo's
 * ~200-line-per-source-file guideline; this is still the same reducer logic,
 * just factored by size rather than by concept. */
export function handleKey(state: AppState, input: string, key: Key): AppState {
  const resolved = resolveAction(state.mode, input, key);
  if (!resolved) return state;

  switch (resolved.type) {
    case "focus-next": {
      const index = FOCUS_ORDER.indexOf(state.focusedPaneId);
      return { ...state, focusedPaneId: FOCUS_ORDER[(index + 1) % FOCUS_ORDER.length], rangeAnchor: null };
    }
    case "focus-prev": {
      const index = FOCUS_ORDER.indexOf(state.focusedPaneId);
      return {
        ...state,
        focusedPaneId: FOCUS_ORDER[(index - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length],
        rangeAnchor: null,
      };
    }
    case "move-selection": {
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      const current = state.selectedFromEnd[state.focusedPaneId] ?? 0;
      // up (-1) means "older", which increases the from-end offset — bounded
      // by the pane's actual event count, or this can climb past the oldest
      // event with nothing visible ever selected again (no upper bound was
      // the bug: "scrolling up doesn't stop at the first element")
      const next = Math.max(0, Math.min(list.length - 1, current - resolved.direction));
      return {
        ...state,
        selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: next },
        rangeAnchor: null,
      };
    }
    case "extend-selection": {
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      const current = state.selectedFromEnd[state.focusedPaneId] ?? 0;
      // first Shift+j/k in a fresh selection anchors the range at wherever
      // the cursor already was; subsequent presses just keep moving the
      // other end — the anchor only resets on a plain move/focus-change/clear
      const anchor = state.rangeAnchor ?? current;
      const next = Math.max(0, Math.min(list.length - 1, current - resolved.direction));
      return {
        ...state,
        selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: next },
        rangeAnchor: anchor,
      };
    }
    case "jump-live":
      return { ...state, selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: 0 }, rangeAnchor: null };
    case "grow":
    case "shrink": {
      const siblings = siblingsInRow(DEFAULT_LAYOUT, state.focusedPaneId);
      const key2 =
        siblings.length > 0 ? `pane:${state.focusedPaneId}` : `row:${rowIndexForPane(DEFAULT_LAYOUT, state.focusedPaneId)}`;
      const current = state.growByKey[key2] ?? 1;
      const updated = resolved.type === "grow" ? growRatio(current) : shrinkRatio(current);
      return { ...state, growByKey: { ...state.growByKey, [key2]: updated } };
    }
    case "zoom-toggle":
      return { ...state, zoomedPaneId: state.zoomedPaneId ? null : state.focusedPaneId };
    case "open-detail": {
      // don't switch to a detail view with nothing to show — a focused pane
      // with zero (filtered) events would otherwise silently do nothing
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      if (list.length === 0) return state;
      return { ...state, mode: "detail" };
    }
    case "close-detail":
      return { ...state, mode: "normal" };
    case "step-detail": {
      const pane = paneById(ALL_PANES, state.focusedPaneId);
      if (!pane) return state;
      const list = listForPane(state, pane);
      const current = state.selectedFromEnd[state.focusedPaneId] ?? 0;
      const next = Math.min(Math.max(0, list.length - 1), Math.max(0, current + resolved.direction));
      return { ...state, selectedFromEnd: { ...state.selectedFromEnd, [state.focusedPaneId]: next } };
    }
    case "filter-start":
      return {
        ...state,
        mode: "filter",
        filterPaneId: state.focusedPaneId,
        filterText: state.appliedFilters[state.focusedPaneId] ?? "",
      };
    case "filter-input":
      return { ...state, filterText: state.filterText + resolved.value };
    case "filter-backspace":
      return { ...state, filterText: state.filterText.slice(0, -1) };
    case "filter-apply": {
      const appliedFilters = { ...state.appliedFilters };
      if (state.filterPaneId) {
        if (state.filterText) appliedFilters[state.filterPaneId] = state.filterText;
        else delete appliedFilters[state.filterPaneId];
      }
      return { ...state, mode: "normal", appliedFilters, filterPaneId: null, filterText: "" };
    }
    case "filter-cancel": {
      const appliedFilters = { ...state.appliedFilters };
      if (state.filterPaneId) delete appliedFilters[state.filterPaneId];
      return { ...state, mode: "normal", appliedFilters, filterPaneId: null, filterText: "" };
    }
    case "search-start":
      return { ...state, mode: "search", searchQuery: "", searchCursor: 0 };
    case "search-input":
      return { ...state, searchQuery: state.searchQuery + resolved.value, searchCursor: 0 };
    case "search-backspace":
      return { ...state, searchQuery: state.searchQuery.slice(0, -1), searchCursor: 0 };
    case "search-move": {
      const matches = findGlobalMatches(state.events, state.searchQuery);
      const next = Math.max(0, Math.min(matches.length - 1, state.searchCursor + resolved.direction));
      return { ...state, searchCursor: next };
    }
    case "search-cancel":
      return { ...state, mode: "normal", searchQuery: "", searchCursor: 0 };
    case "search-select": {
      const matches = findGlobalMatches(state.events, state.searchQuery);
      const selected = matches[state.searchCursor];
      if (!selected) return state;
      const pane = DEFAULT_PANES.find((candidate) => candidate.categories.includes(selected.category));
      if (!pane) return state;
      // ignore the target pane's own per-pane filter when locating the
      // index — a global search match should always be reachable even if
      // that pane currently has an unrelated filter active
      const list = eventsForPane(state.events, pane.categories, undefined);
      const absoluteIndex = list.findIndex((event) => event.id === selected.id);
      if (absoluteIndex === -1) return state;
      return {
        ...state,
        mode: "detail",
        focusedPaneId: pane.id,
        selectedFromEnd: { ...state.selectedFromEnd, [pane.id]: list.length - 1 - absoluteIndex },
        searchQuery: "",
        searchCursor: 0,
      };
    }
    case "clear":
      return { ...state, events: [], rangeAnchor: null };
    case "view-timeline":
      if (state.view === "timeline") return state;
      return {
        ...state,
        view: "timeline",
        savedFocusedPaneId: state.focusedPaneId,
        focusedPaneId: TIMELINE_PANE.id,
        rangeAnchor: null,
      };
    case "view-dashboard":
      if (state.view === "dashboard") return state;
      return {
        ...state,
        view: "dashboard",
        focusedPaneId: state.savedFocusedPaneId,
        rangeAnchor: null,
      };
    default:
      return state;
  }
}
