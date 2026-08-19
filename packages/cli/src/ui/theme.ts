import type { Category } from "@berrylens/protocol";

/** One color per category, used consistently across panes, rows, and the detail overlay. */
export const CATEGORY_COLORS: Record<Category, string> = {
  network: "cyan",
  console: "gray",
  error: "red",
  state: "magenta",
  query: "yellow",
  navigation: "blue",
  storage: "green",
  native: "gray",
};

export const FOCUSED_BORDER_COLOR = "green";
export const UNFOCUSED_BORDER_COLOR = "gray";
