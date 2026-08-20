import type { Key } from "ink";
import type { Category, HelloMessage, InspectorEvent } from "@berrylens/protocol";
import type { ConnectionInfo } from "../server";
import { ALL_PANES, DEFAULT_PANES, TIMELINE_PANE, paneById, type PaneDefinition } from "./paneConfig";
import { sortEventsChronologically } from "./views/timeline";
import { buildDefaultPaneTree, findLeafViewId, type PaneNode } from "./paneTree";
import type { Mode } from "./keymap";

export interface AppState {
  events: InspectorEvent[];
  connectionStatus: "waiting" | "connected" | "disconnected";
  appInfo: { appName: string; platform: string } | null;
  remoteAddress?: string;
  /** Pane tree (Phase 11) — leaves are pane instances (id may differ from
   * `viewId` once a view has been split more than once); rendered by
   * `Dashboard`, mutated by split/close/resize. Not consulted while `view`
   * is `"timeline"` (a virtual full-screen pane outside the tree). */
  paneTree: PaneNode;
  focusedPaneId: string;
  zoomedPaneId: string | null;
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
  /** Id of the active layout preset (Phase 12) — one of `LAYOUT_PRESETS`' ids,
   * or `"custom"` once any pane-tree action (split/close/reopen/resize) has
   * diverged the tree from whichever preset was last selected. */
  layoutPresetId: string;
  /** Snapshot of the developer's own hand-built arrangement, kept in sync by
   * every pane-tree action while `layoutPresetId === "custom"` — lets a
   * custom layout round-trip through the switcher (switch to a preset and
   * back) without being lost. `null` until the tree first diverges. */
  customPaneTree: PaneNode | null;
  /** Cursor position while the layout switcher (`l`) is open. */
  layoutCursor: number;
  /** Which edge of a pane's visible window the selection sticks to while
   * scrolling with j/k — true (default) pins it to the top row, false pins
   * it to the bottom row. Toggled via the `s` settings menu (`settings.ts`'s
   * `SETTINGS`). See `computeScrollWindow`. */
  scrollStickTop: boolean;
  /** Cursor position while the settings menu (`s`) is open — indexes into `SETTINGS`. */
  settingsCursor: number;
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

const DEFAULT_PANE_TREE = buildDefaultPaneTree();

export const initialState: AppState = {
  events: [],
  connectionStatus: "waiting",
  appInfo: null,
  remoteAddress: undefined,
  paneTree: DEFAULT_PANE_TREE,
  focusedPaneId: DEFAULT_PANES[0].id,
  zoomedPaneId: null,
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
  savedFocusedPaneId: DEFAULT_PANES[0].id,
  layoutPresetId: "state-debug", // matches DEFAULT_PANE_TREE, built the same way
  customPaneTree: null,
  layoutCursor: 0,
  scrollStickTop: true,
  settingsCursor: 0,
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
export function listForPane(state: AppState, pane: PaneDefinition, instanceId: string = pane.id): InspectorEvent[] {
  const list = eventsForPane(state.events, pane.categories, state.appliedFilters[instanceId]);
  return pane.id === TIMELINE_PANE.id ? sortEventsChronologically(list) : list;
}

/** Resolves the focused pane's `PaneDefinition` — either directly (the
 * virtual timeline pane, whose id is already a view id) or via the pane
 * tree's leaf-instance-id → view-id mapping (Phase 11: a split-created
 * instance's id can differ from its view id, e.g. `"api-2"`). */
export function focusedPaneDefinition(state: AppState): PaneDefinition | undefined {
  if (state.view === "timeline") return paneById(ALL_PANES, state.focusedPaneId);
  const viewId = findLeafViewId(state.paneTree, state.focusedPaneId);
  return viewId ? paneById(ALL_PANES, viewId) : undefined;
}

/** The event currently shown in the detail view — reused by both the dump and curl-export key handlers. */
export function selectedDetailEvent(state: AppState): InspectorEvent | undefined {
  const pane = focusedPaneDefinition(state);
  if (!pane) return undefined;
  const list = listForPane(state, pane, state.focusedPaneId);
  return list[list.length - 1 - (state.selectedFromEnd[state.focusedPaneId] ?? 0)];
}

