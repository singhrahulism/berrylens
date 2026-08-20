import type { Category } from "@berrylens/protocol";

export interface PaneDefinition {
  id: string;
  title: string;
  categories: Category[];
}

export interface PaneRow {
  paneIds: string[];
}

/** Console/Errors bundled per decision — errors are distinguished by color within the pane. */
export const DEFAULT_PANES: PaneDefinition[] = [
  { id: "nav", title: "NAV / SCREEN", categories: ["navigation"] },
  { id: "state", title: "GLOBAL STATE", categories: ["state"] },
  { id: "api", title: "API CALLS", categories: ["network"] },
  { id: "query", title: "QUERY CACHE", categories: ["query"] },
  { id: "console", title: "CONSOLE / ERRORS", categories: ["console", "error"] },
];

export const DEFAULT_LAYOUT: PaneRow[] = [
  { paneIds: ["nav", "state"] },
  { paneIds: ["api"] },
  { paneIds: ["query", "console"] },
];

/** Not part of `DEFAULT_PANES`/`DEFAULT_LAYOUT` — only used by the "Full"
 * layout preset (Phase 12), which needs a pane per category to actually earn
 * its name (the default grid bundles console+error and has no pane at all
 * for storage/native). */
export const STORAGE_PANE: PaneDefinition = { id: "storage", title: "STORAGE", categories: ["storage"] };
export const NATIVE_PANE: PaneDefinition = { id: "native", title: "NATIVE", categories: ["native"] };

export const GRID_PANES: PaneDefinition[] = [...DEFAULT_PANES, STORAGE_PANE, NATIVE_PANE];

export const ALL_CATEGORIES: Category[] = [
  "network",
  "console",
  "error",
  "state",
  "query",
  "navigation",
  "storage",
  "native",
];

/** Not part of `DEFAULT_LAYOUT`/the grid — a virtual full-screen pane for the
 * timeline view (Phase 10), spanning every category. Kept as an ordinary
 * `PaneDefinition` so it can reuse `paneById`/`eventsForPane`/selection state
 * (keyed by pane id) exactly like every grid pane, instead of a parallel code path. */
export const TIMELINE_PANE: PaneDefinition = { id: "timeline", title: "TIMELINE", categories: ALL_CATEGORIES };

export const ALL_PANES: PaneDefinition[] = [...GRID_PANES, TIMELINE_PANE];

export function paneById(panes: PaneDefinition[], id: string): PaneDefinition | undefined {
  return panes.find((pane) => pane.id === id);
}
