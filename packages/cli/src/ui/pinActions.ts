import { focusedPaneDefinition, listForPane, type AppState } from "./appState";

/** `p` — split out from `keyHandler.ts` purely to keep it under the repo's
 * ~200-line-per-source-file guideline (same reason `paneTreeActions.ts`
 * exists); still the same reducer logic, just factored by size. */
export function handlePinToggle(state: AppState): AppState {
  const pane = focusedPaneDefinition(state);
  if (!pane) return state;
  const list = listForPane(state, pane, state.focusedPaneId);
  const selectedAbsoluteIndex = list.length - 1 - (state.selectedFromEnd[state.focusedPaneId] ?? 0);
  const current = list[selectedAbsoluteIndex];
  if (!current) return state;
  // a live Shift+j/k range pins both ends, same as the range itself is
  // already keyed off `rangeAnchor` — the moving end plus its anchor
  const rangeAnchorEvent = state.rangeAnchor !== null ? list[list.length - 1 - state.rangeAnchor] : undefined;
  // pressing it again on the exact same pin (same event, same range end)
  // unpins; pressing it anywhere else re-pins, no separate unpin step
  const isSamePin =
    state.pinnedEventId === current.id && (state.pinnedRangeAnchorId ?? null) === (rangeAnchorEvent?.id ?? null);
  if (isSamePin) {
    return { ...state, pinnedEventId: null, pinnedRangeAnchorId: null, pinnedRangeEventIds: null, pinnedRangeCategories: null };
  }
  // exact id snapshot of everything between the two endpoints, inclusive —
  // NOT timestamp bounds, so same-millisecond siblings you didn't select
  // (common with concurrent requests) don't get swept in later
  let rangeEventIds: string[] | null = null;
  if (rangeAnchorEvent) {
    const anchorAbsoluteIndex = list.length - 1 - (state.rangeAnchor as number);
    const low = Math.min(selectedAbsoluteIndex, anchorAbsoluteIndex);
    const high = Math.max(selectedAbsoluteIndex, anchorAbsoluteIndex);
    rangeEventIds = list.slice(low, high + 1).map((event) => event.id);
  }
  return {
    ...state,
    pinnedEventId: current.id,
    pinnedRangeAnchorId: rangeAnchorEvent?.id ?? null,
    pinnedRangeEventIds: rangeEventIds,
    pinnedRangeCategories: rangeAnchorEvent ? pane.categories : null,
    // the live range's job is done — its endpoints are captured in the
    // snapshot above. Clearing it here (not just relying on the next
    // focus-changing action to do it) means this pane's own header stops
    // showing a stale "(range: N)" once the pin has taken over as the
    // reference, and there's no dangling `rangeAnchor` left to apply against
    // the wrong pane if focus moves via a path that doesn't already reset it.
    rangeAnchor: null,
  };
}
