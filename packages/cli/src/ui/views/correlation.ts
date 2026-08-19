import type { InspectorEvent } from "@berrylens/protocol";

export interface NearbyEvent {
  event: InspectorEvent;
  offsetMs: number;
  isCenter: boolean;
}

/**
 * Everything across *every* category within `windowMs` of `center`, sorted
 * chronologically with `center` itself included (marked) at its natural
 * position — this is the actual point of the feature: showing the causal
 * chain ("tap → API call → query invalidated → state updated → nav") in one
 * glance instead of eyeballing timestamps across 5 separate panes.
 */
export function findNearbyEvents(allEvents: InspectorEvent[], center: InspectorEvent, windowMs: number): NearbyEvent[] {
  return allEvents
    .filter((event) => Math.abs(event.timestamp - center.timestamp) <= windowMs)
    .map((event) => ({ event, offsetMs: event.timestamp - center.timestamp, isCenter: event.id === center.id }))
    .sort((a, b) => a.offsetMs - b.offsetMs);
}
