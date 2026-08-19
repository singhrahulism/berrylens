---
name: design-system
description: Use whenever creating or modifying anything user-facing in the CLI dashboard (packages/cli/src/ui): panes, overlays, keybindings, status bar, layout.
---

# What this is

berrylens has no visual design system in the usual sense: there is no color
palette to swatch, no button component, no typography scale. The interface
is a terminal UI built with Ink. This document is the equivalent for that
medium: the conventions that make a new pane, overlay, or keybinding feel
like it belongs next to the existing ones, instead of looking hand-rolled.

Read `packages/cli/src/ui/theme.ts`, `layout.ts`, and `keymap.ts` alongside
this file. They are short, and they are the actual source of truth; this
document explains the reasoning behind them.

# Core layout model

A single top-level `App` component (`App.tsx`) owns all state and renders
either the dashboard grid, the full-screen timeline, a zoomed pane, or a
full-screen detail overlay, never more than one of these at once. Nothing
renders "alongside" a detail view at reduced size; opening detail always
replaces the grid, not squeezes below it. This was a real bug once (an
overlay rendered beneath a still-visible grid, silently pushed off-screen by
total height) and the fix, replace rather than stack, is the rule now.

The app root always has an explicit, stable `height={terminalRows}` and
`width={terminalColumns}`, computed from the live terminal size
(`useStdout()`), never left implicit. Ink's diffing needs a consistent
canvas across mode transitions (grid to detail view to grid again) or a
stale frame can linger until the next keypress forces a repaint. Terminal
size reads must guard against a transient `0` (some terminals report this
mid-resize) with an explicit `positiveOr()` check, not a bare `??`, since `0`
is not `undefined` and a `0` height collapses the whole app.

Every row height, pane width, and window of visible rows *whose exact number
feeds a "how many items fit" calculation* is computed explicitly by the
caller (`computeProportionalSizes`, `visibleRowsForPaneHeight`,
`computeScrollWindow` in `layout.ts`) and passed down as a fixed number, not
approximated with flexbox `flexGrow`. Flexbox's actual distribution and a
hand-rolled row count can silently diverge (this showed up once as
unexplained blank space at the bottom of a pane that had more events to
show, when row heights were flexGrow-approximated but the visible-row count
fed to `.slice()` was computed separately). If a new view needs its own size
math for this purpose, add a pure, tested function to `layout.ts` rather than
eyeballing a flex ratio.

Two narrower, deliberate exceptions, both in `NetworkDetailOverlay.tsx`:
panels B and C each get `flexGrow={1}` for an even width split, since neither
`JsonViewer` nor `ScrollableLines` needs a precomputed *width* to determine
what fits (only height matters for that, and panel height is still explicit
via `layout.bodyContentRows`), so there's no hand-rolled number that can
diverge from Yoga's actual math. Every full-screen overlay's outer container
(`DetailOverlay`, `NetworkDetailOverlay`, `StateDetailOverlay`,
`SearchOverlay`) also has `flexGrow={1}`, but that's a single element filling
whatever vertical space remains inside an already explicitly-sized parent
(the app root's `height={terminalRows}`), not a proportional split between
competing siblings, so it's not the same risk either. If a new flexGrow usage
doesn't fit one of these two shapes (fill-remaining-space, or an even split
where no sibling's content-fitting math depends on the exact number), compute
it explicitly instead.

# Panes and views

A pane is a bordered, titled, focusable box: title bar, scrollable event
list, focused/unfocused border color. `Pane` (`components/Pane.tsx`) is the
one component for this and is driven entirely by props, it never reads state
or touches the event bus itself. A "view" (in the Phase 10+ sense: dashboard
grid, timeline) is a different arrangement of `Pane` instances over the same
underlying event list, not a different component.

The default grid is five panes over three rows (`paneConfig.ts`), each
scoped to one or two categories. Console and Errors are deliberately bundled
into one pane, with errors distinguished by color rather than a separate
pane, since a developer usually wants errors in context next to the logs
around them, not isolated. Follow this precedent (bundle related categories
that are usually read together) rather than defaulting to one pane per
category when adding a new grouping.

The timeline is a full-screen view spanning every category, chronologically
sorted rather than arrival-ordered. It is implemented as an ordinary
`PaneDefinition` (`TIMELINE_PANE` in `paneConfig.ts`) with `id: "timeline"`,
not a parallel rendering path, specifically so it can reuse `paneById`,
per-pane selection state, filtering, and the detail view for free. When
adding a new full-screen view, follow this shape: give it a
`PaneDefinition`, not a bespoke component with its own state.

# Color

One color per event category (`CATEGORY_COLORS` in `theme.ts`): network
cyan, console gray, error red, state magenta, query yellow, navigation blue,
storage green, native gray. This mapping is used everywhere an event
appears, in every pane, the timeline, the correlation strip, so a category
is recognizable by color alone regardless of which view is showing it. Do
not introduce a second color meaning (do not reuse red for anything other
than errors, do not reuse cyan for anything other than network).

Every other named color used anywhere in `ui/` lives in `theme.ts` too, no
exceptions: `FOCUSED_BORDER_COLOR`/`UNFOCUSED_BORDER_COLOR` for pane and
sub-panel focus state, and one constant per full-screen overlay's outer
border (`GENERIC_DETAIL_BORDER_COLOR`, `NETWORK_DETAIL_BORDER_COLOR`,
`STATE_DETAIL_BORDER_COLOR`, `SEARCH_BORDER_COLOR`) even where two of them
happen to share the same literal value today. A new overlay or component
should import a named constant, never write a raw color string like
`borderColor="cyan"` inline; if the right constant doesn't exist yet, add it
to `theme.ts` rather than hardcoding.

Cross-pane time highlighting uses a leading character (`▸`) plus bold rather
than an ANSI text attribute like underline, because not every terminal
renders every attribute reliably; a leading glyph is guaranteed visible
everywhere.

# Detail views

Every event category gets one of three detail treatments, chosen in
`App.tsx` by category and payload shape, never by a per-event flag:

- Network events: `NetworkDetailOverlay`, a three-panel A/B/C layout
  (request overview on top, request body or query params and response
  side by side below), each panel independently scrollable with `Tab`
  cycling keyboard focus between them.
- State events carrying a diff (`{key: {from, to}}`, captured by the Redux
  and Zustand adapters): `StateDetailOverlay`, a CHANGED section up front,
  falling back to the generic view if no diff was captured.
- Everything else: `DetailOverlay`, a collapsible JSON tree
  (`components/JsonViewer.tsx`) with a raw pretty-printed JSON toggle (`v`).

Every detail view ends with a correlation strip (`CorrelationStrip.tsx`):
every event across every category within 500ms, chronological, the current
event marked. This is not decoration, it is the actual point of the tool
(reconstructing a causal chain across categories at a glance), so a new
detail view should include it rather than omit it for space.

When adding a new category-specific detail treatment, follow the existing
branch in `App.tsx` (`DetailComponent = category === X && hasY(event) ? XOverlay : DetailOverlay`)
rather than adding a new prop threading mechanism.

# Keybindings

`keymap.ts` is the single source of truth: one `resolveAction(mode, input,
key)` function returning a typed `Action` or `null`. No component calls
`useInput` itself, anywhere, including inside detail-view sub-panels;
`App.tsx` has the only `useInput` call in the whole UI, and everything is
resolved through `resolveAction` before anything reacts to it. A new
keybinding is a new `Action` variant plus one new `if` branch in
`resolveAction`, not a `useInput` handler added somewhere else in the tree.

Detail-view sub-navigation (JSON tree cursor/expand, network A/B/C panel
focus, raw-JSON scroll) is a deliberate exception to "dispatch through the
reducer", not to "resolve through keymap.ts": those keystrokes still resolve
centrally, into a `DetailAction` (a tagged subset of `Action`:
`detail-move`, `detail-expand`, `detail-collapse`, `detail-toggle-node`,
`detail-toggle-raw`, `detail-panel-focus`), but their *effect* is UI-local
state (an expand-path set, a cursor index, a scroll offset) that would be
awkward and unnecessary to thread through global `AppState`, especially
since two `JsonViewer`s can be open at once (network panels B and C) with
independently different data. `App.tsx` forwards a resolved `DetailAction` to
whichever detail component is mounted via a `DetailHandle` ref
(`{ handleDetailAction(action) }`, exposed with `useImperativeHandle`), and
each detail component still keeps its own local `useState` for that
UI-local state, forwarding further to a nested `DetailHandle` ref where it
owns sub-panels (`NetworkDetailOverlay` decides which of its three panels to
forward to, and separately handles `detail-panel-focus` itself since only it
has sub-panels). If a new detail component needs its own interactive local
state, follow this shape: implement `DetailHandle`, keep the state local, do
not add a `useInput` call.

Prefer a plain, unmodified lowercase letter over a Shift-modified one when
both are free. `T`/`D` (uppercase-only) for the timeline toggle was a real
usability mistake: a user naturally reached for `t`/`d` without Shift, and
nothing happened. The fix was to accept both cases, but the lesson is to
default to the unmodified key from the start. Reserve Shift-modified keys
(`J`/`K` for range selection) for actions that are deliberately a variant of
an existing plain key, not for an unrelated new action.

`resolveAction` branches on four modes (`normal`, `filter`, `search`,
`detail`), and a keybinding only means one thing within its own mode, not
globally. `Ctrl+C` is the one true exception (checked before the mode
branch, quits from anywhere). Normal mode has the keys most often thought of
as "the" keybindings: `Tab`/`Shift+Tab` focus, `j`/`k`/arrows scroll, `+`/`-`
resize, `z` zoom, `Enter` open detail, `/` filter the focused pane, `?`
search everything, `c` clear, `t`/`d` switch between the timeline and
dashboard views, `q` quit. Detail mode layers two kinds of keys: `n`/`p`
step, `d` dump to `$EDITOR`, `y` curl export (network only), `Esc` back to
normal mode, `q` quit (dispatched through the reducer, same as normal mode);
and `j`/`k`/arrows, `h`/`l`, `Enter`, `v`, `Tab`/`Shift+Tab` (resolved into a
`DetailAction` and forwarded to the mounted detail component instead, see
below); note `d` means something different here than in normal mode (dump,
not switch-to-dashboard) precisely because the two modes never see each
other's keys. Filter and search mode consume almost every
keystroke as text input for the query/filter string, with only `Enter`,
`Esc`, and (in search) the arrow keys carved out as actions. When adding a
keybinding, decide which single mode it belongs to and add it to that mode's
branch in `resolveAction`, don't assume a key is safe to reuse across modes
without checking whether it already means something else in another one.

# Status and feedback

The status bar (`StatusBar.tsx`) is always visible, regardless of which pane
is focused or whether a detail view is open, and is the one place for
information the developer should never have to go looking for: connection
state, Metro pairing, event count, and the error counter with a brief
flash on a new error. If a new kind of "the developer should notice this
regardless of where they're looking" signal is needed, it goes in the status
bar, not a toast or a pane-local badge.

Transient confirmations (curl copied, file saved) use a `statusMessage`
string in `AppState` that self-clears after a few seconds via
`setTimeout(() => dispatch(...), DURATION)`, the same pattern reused for the
error flash. Follow this pattern for any new transient confirmation rather
than introducing a second mechanism.

# Terminal conventions

The dashboard uses the alternate screen buffer on startup (the same
mechanism `vim`/`htop`/`less` use), not a destructive `console.clear()`, so
the developer's shell scrollback is preserved and restored automatically on
quit. Never call `console.clear()` in this codebase.

Nothing in the CLI truncates or size-caps captured data by default (network
bodies, headers, and payloads render in full, scrolled rather than cut).
This is a debugging tool; verbosity is the point. If a new view needs to
summarize rather than show everything, make that an explicit, collapsible
choice (like the JSON tree's collapsed-by-default nesting), not silent
truncation.

# Before finishing a UI change

Does a similar pane, overlay, or keybinding already exist to copy the shape
of? Does the new code read raw keypresses anywhere outside `keymap.ts`? Does
a component read from state or the event bus directly instead of taking
props? Is any size or row count hardcoded instead of computed from the live
terminal size? Run the change under a real terminal, not just the test
suite. `ink-testing-library` is a faithful headless renderer for assertions,
but keyboard behavior (especially Shift-modified keys and terminal-specific
quirks) is worth confirming live before calling a UI change done.
