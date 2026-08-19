import type { InspectorEvent } from "@berrylens/protocol";

/**
 * Chronological, cross-category projection of the event stream — the timeline
 * view's core transform. Pure so out-of-order arrival can never produce a
 * misleading timeline, even though in practice `state.events` is already
 * append-ordered by arrival time (a stable sort is a no-op in that case).
 */
export function sortEventsChronologically(events: InspectorEvent[]): InspectorEvent[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp);
}
