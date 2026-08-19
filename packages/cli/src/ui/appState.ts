import type { Key } from "ink";
import type { Category, HelloMessage, InspectorEvent } from "@berrylens/protocol";
import type { ConnectionInfo } from "../server";
import { ALL_PANES, DEFAULT_PANES, FOCUS_ORDER, TIMELINE_PANE, paneById, type PaneDefinition } from "./paneConfig";
import { sortEventsChronologically } from "./views/timeline";
import type { Mode } from "./keymap";

export interface AppState {
  events: InspectorEvent[];
  connectionStatus: "waiting" | "connected" | "disconnected";
  appInfo: { appName: string; platform: string } | null;
  remoteAddress?: string;
  focusedPaneId: string;
  zoomedPaneId: string | null;
  growByKey: Record<string, number>;
  selectedFromEnd: Record<string, number>;
  mode: Mode;
  filterPaneId: string | null;
  filterText: string;
  appliedFilters: Record<string, string>;
  statusMessage: string | null;
  searchQuery: string;
  searchCursor: number;
  errorFlashActive: boolean;
  /** The OTHER end of a Shift+j/k range selection in the focused pane, from-end indexed
   * like `selectedFromEnd` — null when no range is active (plain single selection). */
  rangeAnchor: number | null;
  /** Top-level view: the dashboard grid, or the full-screen cross-category timeline (Phase 10). */
  view: "dashboard" | "timeline";
  /** `focusedPaneId` to restore when leaving the timeline view back to the dashboard. */
  savedFocusedPaneId: string;
}

export type AppEvent =
  | { kind: "event"; event: InspectorEvent }
  | { kind: "hello"; message: HelloMessage }
  | { kind: "disconnection" }
  | { kind: "connection"; info: ConnectionInfo }
  | { kind: "key"; input: string; key: Key }
  | { kind: "status"; message: string | null }
  | { kind: "error-flash" }
  | { kind: "clear-error-flash" };

export const initialState: AppState = {
  events: [],
  connectionStatus: "waiting",
  appInfo: null,
  remoteAddress: undefined,
  focusedPaneId: FOCUS_ORDER[0],
  zoomedPaneId: null,
  growByKey: {},
  selectedFromEnd: Object.fromEntries(DEFAULT_PANES.map((pane) => [pane.id, 0])),
  mode: "normal",
  filterPaneId: null,
  filterText: "",
  appliedFilters: {},
  statusMessage: null,
  searchQuery: "",
  searchCursor: 0,
  errorFlashActive: false,
  rangeAnchor: null,
  view: "dashboard",
  savedFocusedPaneId: FOCUS_ORDER[0],
};

export function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function eventsForPane(events: InspectorEvent[], categories: Category[], filter: string | undefined): InspectorEvent[] {
  let list = events.filter((event) => categories.includes(event.category));
  if (filter) {
    const needle = filter.toLowerCase();
    list = list.filter((event) => event.label.toLowerCase().includes(needle));
  }
  return list;
}

export function hasDiff(event: InspectorEvent): boolean {
  const diff = (event.data as { diff?: unknown }).diff;
  return typeof diff === "object" && diff !== null && Object.keys(diff).length > 0;
}

/** Events for a given pane, chronologically sorted when it's the timeline
 * pseudo-pane (Phase 10) — every other pane's events are already in arrival
 * order, so this is a no-op for them; kept as one function so the ordering
 * used for on-screen rendering and for selection/detail-lookup math never
 * diverges. */
export function listForPane(state: AppState, pane: PaneDefinition): InspectorEvent[] {
  const list = eventsForPane(state.events, pane.categories, state.appliedFilters[pane.id]);
  return pane.id === TIMELINE_PANE.id ? sortEventsChronologically(list) : list;
}

/** The event currently shown in the detail view — reused by both the dump and curl-export key handlers. */
export function selectedDetailEvent(state: AppState): InspectorEvent | undefined {
  const pane = paneById(ALL_PANES, state.focusedPaneId);
  if (!pane) return undefined;
  const list = listForPane(state, pane);
  return list[list.length - 1 - (state.selectedFromEnd[state.focusedPaneId] ?? 0)];
}

