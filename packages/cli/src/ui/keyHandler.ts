import type { Key } from "ink";
import { DEFAULT_PANES, TIMELINE_PANE } from "./paneConfig";
import { isPaneTreeAction, resolveAction } from "./keymap";
import { findGlobalMatches } from "./views/search";
import { eventsForPane, focusedPaneDefinition, listForPane, type AppState } from "./appState";
import { collectLeaves } from "./paneTree";
import { handlePaneTreeAction } from "./paneTreeActions";
import { LAYOUT_PRESETS, layoutOptions } from "./layoutPresets";
import { SETTINGS } from "./settings";

/** Every keyboard-driven state transition in normal/filter/search mode —
 * split out from `appState.ts` purely to keep both files under the repo's
 * ~200-line-per-source-file guideline; this is still the same reducer logic,
 * just factored by size rather than by concept. */
export function handleKey(state: AppState, input: string, key: Key): AppState {
  const resolved = resolveAction(state.mode, input, key);
  if (!resolved) return state;
  if (isPaneTreeAction(resolved)) return handlePaneTreeAction(state, resolved);

  switch (resolved.type) {
    case "move-selection": {
      const pane = focusedPaneDefinition(state);
      if (!pane) return state;
      const list = listForPane(state, pane, state.focusedPaneId);
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
      const pane = focusedPaneDefinition(state);
      if (!pane) return state;
      const list = listForPane(state, pane, state.focusedPaneId);
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
    case "zoom-toggle":
      return { ...state, zoomedPaneId: state.zoomedPaneId ? null : state.focusedPaneId };
    case "open-detail": {
      // don't switch to a detail view with nothing to show — a focused pane
      // with zero (filtered) events would otherwise silently do nothing
      const pane = focusedPaneDefinition(state);
      if (!pane) return state;
      const list = listForPane(state, pane, state.focusedPaneId);
      if (list.length === 0) return state;
      return { ...state, mode: "detail" };
    }
    case "close-detail":
      return { ...state, mode: "normal" };
    case "step-detail": {
      const pane = focusedPaneDefinition(state);
      if (!pane) return state;
      const list = listForPane(state, pane, state.focusedPaneId);
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
      // prefer an existing instance of this view (the original may have been
      // closed after a split, leaving only e.g. "api-2" in the tree)
      const instances = collectLeaves(state.paneTree).filter((leaf) => leaf.viewId === pane.id);
      const targetId = instances.find((leaf) => leaf.id === pane.id)?.id ?? instances[0]?.id ?? pane.id;
      return {
        ...state,
        mode: "detail",
        focusedPaneId: targetId,
        selectedFromEnd: { ...state.selectedFromEnd, [targetId]: list.length - 1 - absoluteIndex },
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
    case "layout-start": {
      const options = layoutOptions(Boolean(state.customPaneTree));
      const current = options.findIndex((option) => option.id === state.layoutPresetId);
      return { ...state, mode: "layout", layoutCursor: current === -1 ? 0 : current };
    }
    case "layout-move": {
      const options = layoutOptions(Boolean(state.customPaneTree));
      const next = Math.max(0, Math.min(options.length - 1, state.layoutCursor + resolved.direction));
      return { ...state, layoutCursor: next };
    }
    case "layout-cancel":
      return { ...state, mode: "normal" };
    case "layout-select": {
      const options = layoutOptions(Boolean(state.customPaneTree));
      const chosen = options[state.layoutCursor];
      if (!chosen) return { ...state, mode: "normal" };
      const newTree =
        chosen.id === "custom"
          ? (state.customPaneTree ?? state.paneTree)
          : (LAYOUT_PRESETS.find((preset) => preset.id === chosen.id)?.buildTree() ?? state.paneTree);
      const leaves = collectLeaves(newTree);
      return {
        ...state,
        mode: "normal",
        paneTree: newTree,
        layoutPresetId: chosen.id,
        focusedPaneId: leaves[0]?.id ?? state.focusedPaneId,
        zoomedPaneId: null,
        rangeAnchor: null,
      };
    }
    case "settings-start":
      return { ...state, mode: "settings", settingsCursor: 0 };
    case "settings-move": {
      const next = Math.max(0, Math.min(SETTINGS.length - 1, state.settingsCursor + resolved.direction));
      return { ...state, settingsCursor: next };
    }
    case "settings-cancel":
      return { ...state, mode: "normal" };
    case "settings-toggle": {
      const chosen = SETTINGS[state.settingsCursor];
      return chosen ? chosen.toggle(state) : state;
    }
    default:
      return state;
  }
}
