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

export function focusOrder(layout: PaneRow[]): string[] {
  return layout.flatMap((row) => row.paneIds);
}

export function paneById(panes: PaneDefinition[], id: string): PaneDefinition | undefined {
  return panes.find((pane) => pane.id === id);
}

export function rowIndexForPane(layout: PaneRow[], paneId: string): number {
  return layout.findIndex((row) => row.paneIds.includes(paneId));
}

export function siblingsInRow(layout: PaneRow[], paneId: string): string[] {
  const row = layout.find((candidate) => candidate.paneIds.includes(paneId));
  return row ? row.paneIds.filter((id) => id !== paneId) : [];
}
