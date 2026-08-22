import { DEFAULT_PANES } from "./paneConfig";
import { growRatio, shrinkRatio } from "./layout";
import { focusedPaneDefinition, type AppState } from "./appState";
import type { PaneTreeAction } from "./keymap";
import { adjustWeightForLeaf, closePane, collectLeaves, findDirectionalNeighbor, nextInstanceId, splitPane } from "./paneTree";

/** Every keyboard-driven transition that only touches `paneTree`/focus/zoom
 * — split out from `keyHandler.ts` (Phase 11) purely to keep both files
 * under the repo's ~200-line-per-source-file guideline. */
export function handlePaneTreeAction(state: AppState, resolved: PaneTreeAction): AppState {
  switch (resolved.type) {
    case "focus-next": {
      const order = collectLeaves(state.paneTree).map((leaf) => leaf.id);
      const index = order.indexOf(state.focusedPaneId);
      return { ...state, focusedPaneId: order[(index + 1) % order.length] ?? state.focusedPaneId, rangeAnchor: null };
    }
    case "focus-prev": {
      const order = collectLeaves(state.paneTree).map((leaf) => leaf.id);
      const index = order.indexOf(state.focusedPaneId);
      return {
        ...state,
        focusedPaneId: order[(index - 1 + order.length) % order.length] ?? state.focusedPaneId,
        rangeAnchor: null,
      };
    }
    case "move-focus": {
      if (state.view === "timeline") return state;
      const target = findDirectionalNeighbor(state.paneTree, state.focusedPaneId, resolved.direction);
      if (!target) return state;
      return { ...state, focusedPaneId: target, rangeAnchor: null };
    }
    case "split-pane": {
      if (state.view === "timeline") return state; // the timeline pane isn't a tree leaf
      const viewId = focusedPaneDefinition(state)?.id ?? state.focusedPaneId;
      const newId = nextInstanceId(state.paneTree, viewId);
      const newTree = splitPane(state.paneTree, state.focusedPaneId, resolved.direction, { type: "leaf", id: newId, viewId });
      if (newTree === state.paneTree) return state; // no-op: MAX_PANES reached, or target not found
      return {
        ...state,
        paneTree: newTree,
        focusedPaneId: newId,
        selectedFromEnd: { ...state.selectedFromEnd, [newId]: state.selectedFromEnd[state.focusedPaneId] ?? 0 },
        rangeAnchor: null,
        layoutPresetId: "custom",
        customPaneTree: newTree,
      };
    }
    case "open-view": {
      if (state.view === "timeline") return state;
      // reopen whichever default view has no instance left in the tree —
      // the only way a view (e.g. GLOBAL STATE) becomes reachable again
      // after it's been closed entirely, since split only ever duplicates
      // the *focused* pane's own view, never picks a different one
      const openViewIds = new Set(collectLeaves(state.paneTree).map((leaf) => leaf.viewId));
      const missing = DEFAULT_PANES.find((pane) => !openViewIds.has(pane.id));
      if (!missing) return state; // every default view already has an instance open
      const newId = nextInstanceId(state.paneTree, missing.id);
      const newTree = splitPane(state.paneTree, state.focusedPaneId, resolved.direction, {
        type: "leaf",
        id: newId,
        viewId: missing.id,
      });
      if (newTree === state.paneTree) return state; // no-op: MAX_PANES reached
      return {
        ...state,
        paneTree: newTree,
        focusedPaneId: newId,
        selectedFromEnd: { ...state.selectedFromEnd, [newId]: 0 },
        rangeAnchor: null,
        layoutPresetId: "custom",
        customPaneTree: newTree,
      };
    }
    case "close-pane": {
      if (state.view === "timeline") return state;
      const result = closePane(state.paneTree, state.focusedPaneId);
      if (!result) return state; // no-op: closing the last remaining pane
      const stillFocused = collectLeaves(result).some((leaf) => leaf.id === state.focusedPaneId);
      return {
        ...state,
        paneTree: result,
        focusedPaneId: stillFocused ? state.focusedPaneId : collectLeaves(result)[0].id,
        zoomedPaneId: state.zoomedPaneId === state.focusedPaneId ? null : state.zoomedPaneId,
        rangeAnchor: null,
        layoutPresetId: "custom",
        customPaneTree: result,
      };
    }
    case "grow":
    case "shrink": {
      const transform = resolved.type === "grow" ? growRatio : shrinkRatio;
      const newTree = adjustWeightForLeaf(state.paneTree, state.focusedPaneId, transform);
      return { ...state, paneTree: newTree, layoutPresetId: "custom", customPaneTree: newTree };
    }
    default:
      return state;
  }
}
