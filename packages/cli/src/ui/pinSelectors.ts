import type { Category, InspectorEvent } from "@berrylens/protocol";
import { focusedPaneDefinition, listForPane, type AppState } from "./appState";

/** Split out from `appState.ts` purely to keep it under the repo's
 * ~200-line-per-source-file guideline — same reason `pinActions.ts` exists
 * alongside `keyHandler.ts`; still the same selector logic, just factored by
 * size rather than by concept. */

/** Resolves `pinnedEventId` back to its event by id (never by position — see
 * the field's doc comment on `AppState`). `undefined` when nothing is pinned
 * or the pinned event has aged out of `events`. */
export function pinnedEvent(state: AppState): InspectorEvent | undefined {
  return state.pinnedEventId ? state.events.find((event) => event.id === state.pinnedEventId) : undefined;
}

/** Resolves `pinnedRangeAnchorId` the same way `pinnedEvent` resolves
 * `pinnedEventId` — `undefined` when the pin isn't a range, or its anchor
 * has aged out of `events`. */
export function pinnedRangeAnchorEvent(state: AppState): InspectorEvent | undefined {
  return state.pinnedRangeAnchorId ? state.events.find((event) => event.id === state.pinnedRangeAnchorId) : undefined;
}

export interface CrossPaneHighlight {
  /** Time bounds for the ▸ "at or after" marker in every other pane. */
  from: number | undefined;
  to: number | undefined;
  /** Id(s) that get the ◆ pinned marker, regardless of pane focus. */
  pinnedEventId: string | undefined;
  pinnedRangeAnchorId: string | undefined;
  /** What the status bar shows next to "pinned:" — both labels, chronological, for a range. */
  statusLabel: string | undefined;
  /** Exact id snapshot + categories for a pinned range — see the field docs
   * on `AppState`. `undefined` for a single-event pin or no pin at all. */
  rangeEventIds: string[] | undefined;
  rangeCategories: Category[] | undefined;
}

/** Single source of truth for what drives the cross-pane ▸/◆ highlighting —
 * a pin (single event or a Shift+j/k range pinned with `p`) overrides the
 * anchor entirely, decoupling it from `focusedPaneId`/`selectedFromEnd` so
 * navigating away doesn't move what other panes highlight against. Without a
 * pin, a live range gets both bounds (inclusive); a single live selection is
 * open-ended (existing "at or after" behavior). */
export function crossPaneHighlight(state: AppState): CrossPaneHighlight {
  const focusedPane = focusedPaneDefinition(state);
  const focusedList = focusedPane ? listForPane(state, focusedPane, state.focusedPaneId) : [];
  const detailEvent = focusedList[focusedList.length - 1 - (state.selectedFromEnd[state.focusedPaneId] ?? 0)];
  const rangeAnchorEvent =
    state.rangeAnchor !== null ? focusedList[focusedList.length - 1 - state.rangeAnchor] : undefined;
  const pinned = pinnedEvent(state);
  const pinnedRangeAnchor = pinned ? pinnedRangeAnchorEvent(state) : undefined;

  const from = pinned
    ? pinnedRangeAnchor
      ? Math.min(pinned.timestamp, pinnedRangeAnchor.timestamp)
      : pinned.timestamp
    : rangeAnchorEvent && detailEvent
      ? Math.min(rangeAnchorEvent.timestamp, detailEvent.timestamp)
      : detailEvent?.timestamp;
  const to = pinned
    ? pinnedRangeAnchor
      ? Math.max(pinned.timestamp, pinnedRangeAnchor.timestamp)
      : undefined
    : rangeAnchorEvent && detailEvent
      ? Math.max(rangeAnchorEvent.timestamp, detailEvent.timestamp)
      : undefined;
  const statusLabel = pinned
    ? pinnedRangeAnchor
      ? [pinned, pinnedRangeAnchor]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((event) => event.label)
          .join(" … ")
      : pinned.label
    : undefined;

  // gated on `pinned` resolving, same as everything else here — if the
  // primary pinned event has aged out of `events`, the whole pin (range
  // snapshot included) is treated as cleared, no separate eviction handling
  return {
    from,
    to,
    pinnedEventId: pinned?.id,
    pinnedRangeAnchorId: pinnedRangeAnchor?.id,
    statusLabel,
    rangeEventIds: pinned ? (state.pinnedRangeEventIds ?? undefined) : undefined,
    rangeCategories: pinned ? (state.pinnedRangeCategories ?? undefined) : undefined,
  };
}

/** Whether `event` gets the ▸ "at or after" marker under `highlight` — the
 * one predicate `Pane` (rendering) and the `h`/`H` jump actions both use, so
 * "what's highlighted" can never drift between what you see and where those
 * keys land. Within the pinned range's own categories, membership must be
 * exact (`rangeEventIds`); everywhere else, the timestamp bounds are still
 * correct — see the field docs on `CrossPaneHighlight`. */
export function isEventHighlighted(event: InspectorEvent, highlight: CrossPaneHighlight): boolean {
  if (highlight.rangeCategories?.includes(event.category)) {
    return highlight.rangeEventIds?.includes(event.id) ?? false;
  }
  return (
    highlight.from !== undefined &&
    event.timestamp >= highlight.from &&
    (highlight.to === undefined || event.timestamp <= highlight.to)
  );
}
