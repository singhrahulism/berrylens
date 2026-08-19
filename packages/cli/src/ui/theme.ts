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

/** Outer border color per full-screen overlay — each overlay type gets its
 * own constant (even where two happen to share a value today) so they can
 * diverge independently later without a stray hardcoded string reappearing. */
export const GENERIC_DETAIL_BORDER_COLOR = "white";
export const NETWORK_DETAIL_BORDER_COLOR = "cyan";
export const STATE_DETAIL_BORDER_COLOR = "magenta";
export const SEARCH_BORDER_COLOR = "magenta";
