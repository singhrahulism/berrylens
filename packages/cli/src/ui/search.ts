import type { InspectorEvent } from "@berrylens/protocol";

/**
 * Cross-category search — matches label, category, *and* the full payload
 * (stringified), not just the label. That last part is the actual point:
 * "where did this user ID / token / error message show up across
 * everything" usually means finding it buried in a request body or a state
 * snapshot, not in the terse one-line label.
 */
export function findGlobalMatches(events: InspectorEvent[], query: string): InspectorEvent[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return events
    .filter((event) => matchesEvent(event, needle))
    .slice()
    .reverse(); // most recent first
}

function matchesEvent(event: InspectorEvent, needle: string): boolean {
  if (event.label.toLowerCase().includes(needle)) return true;
  if (event.category.toLowerCase().includes(needle)) return true;
  try {
    return JSON.stringify(event.data).toLowerCase().includes(needle);
  } catch {
    return false;
  }
}
