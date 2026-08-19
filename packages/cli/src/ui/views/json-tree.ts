export interface FlatJsonNode {
  path: string;
  depth: number;
  displayKey: string;
  isContainer: boolean;
  isExpanded: boolean;
  preview: string;
}

const ROOT_PATH = "$";

/**
 * Flattens a JSON value into the list of currently-*visible* lines (i.e.
 * respecting which containers are collapsed) — this is what both the
 * renderer and cursor up/down navigation walk, so collapsed subtrees never
 * show up and never get counted.
 */
export function flattenVisibleNodes(
  value: unknown,
  expandedPaths: ReadonlySet<string>,
  path: string = ROOT_PATH,
  depth = 0,
  key = "",
): FlatJsonNode[] {
  const isContainer = value !== null && typeof value === "object";
  const expanded = isContainer && expandedPaths.has(path);
  const node: FlatJsonNode = {
    path,
    depth,
    displayKey: key,
    isContainer,
    isExpanded: expanded,
    preview: isContainer ? containerPreview(value as object) : formatLeaf(value),
  };

  const result: FlatJsonNode[] = [node];
  if (expanded) {
    const entries: Array<[string, unknown]> = Array.isArray(value)
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value as Record<string, unknown>);
    for (const [childKey, childValue] of entries) {
      result.push(...flattenVisibleNodes(childValue, expandedPaths, `${path}.${childKey}`, depth + 1, childKey));
    }
  }
  return result;
}

export { ROOT_PATH };

function containerPreview(value: object): string {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? "" : "s"}]`;
  const count = Object.keys(value).length;
  return `{${count} key${count === 1 ? "" : "s"}}`;
}

function formatLeaf(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
