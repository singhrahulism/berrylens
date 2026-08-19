# berrylens

A dev-time runtime inspector for React Native: automatically observed Network /
Console / Errors / State / Query / Navigation / Storage activity in one
categorized, correlated terminal dashboard — instead of a scattered
`console.log` stream.

Two separate pieces, distributed differently:

- **`berrylens` (the SDK)** — an npm package your app depends on. One
  `attachInspector()` call patches `fetch`/`console`/errors and (optionally)
  hooks into Redux/React Query/React Navigation/Zustand. This has to run
  *inside* your app's JS runtime — there's no way around that, same as any
  logging/observability SDK.
- **`berrylens-cli` (the TUI dashboard)** — a standalone tool you run on your
  dev machine, *not* a dependency of your app. It only ever talks to the SDK
  over a small WebSocket protocol, so it works with any app that has the SDK
  installed.

This package isn't published to npm yet, so for now the SDK is distributed as
a tarball built with `npm pack` — installing it that way is functionally
identical to a real registry install (same files, same resolution), so
everything below will work unchanged once it's actually published; only the
install command changes (from a `.tgz` path to a plain package name).

## 1. Install the SDK into your app

`packages/sdk` (published as `berrylens`) depends on a small shared types
package, `@berrylens/protocol`, which isn't on the npm registry either — so
install both tarballs together in one command:

```bash
cd /path/to/your-react-native-app
npm install \
  /Users/rahulsingh/Documents/self/berrylens/dist-tarballs/berrylens-protocol-0.0.1.tgz \
  /Users/rahulsingh/Documents/self/berrylens/dist-tarballs/berrylens-0.0.1.tgz
```

(Rebuild the tarballs after any SDK change: `cd packages/protocol && npm pack
--pack-destination ../../dist-tarballs`, then the same for `packages/sdk`.)

## 2. Call `attachInspector()` once, at app start

Put this near your app's root — e.g. `App.tsx` or `app/_layout.tsx` for
`expo-router` — before anything else meaningfully runs:

```ts
import { attachInspector, inspectStore } from "berrylens";

const inspector = attachInspector({
  appName: "neary-app",
  host: "192.168.1.14", // your Mac's LAN IP — see note below on why this is worth setting explicitly

  // Optional, one-line-per-instance — pass whichever of these you have *and
  // already have an instance for* at this point (attachInspector() typically
  // runs at module scope, before any component has mounted):
  reduxStore: store,          // a Redux store instance
  queryClient: queryClient,   // an existing TanStack QueryClient
});

// Zustand has no central store registry, so each store attaches separately:
inspector.attach(inspectStore(useMyStore, "myStore"));
```

Everything else — network requests (`fetch`/XHR, which covers Axios, with
full request/response headers and bodies, uncapped), `console.*`, uncaught
errors/unhandled rejections, and AsyncStorage — is captured automatically
with no further calls.

### Navigation, and anything else only available after mount

`navigationRef` usually *can't* be passed to `attachInspector()` directly,
because it doesn't exist yet at module-eval time — most concretely, under
`expo-router`, the nav ref is only obtainable via a hook (`useNavigationContainerRef`)
inside a mounted component. Use `inspector.attach(...)` there instead, same
pattern as Zustand:

```ts
import { navigationAdapter } from "berrylens";
import { useNavigationContainerRef } from "expo-router"; // or "@react-navigation/native"

function RootLayoutContent() {
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    return inspector.attach(navigationAdapter(navigationRef));
  }, [navigationRef]);

  // ...
}
```

(`reduxAdapter` and `reactQueryAdapter` are exported the same way, for the
same late-binding case if you ever need it.)

### Host resolution

`attachInspector()` tries to auto-detect the dev-machine host from Metro's
own bundler URL (`NativeModules.SourceCode.scriptURL`). This is convenient
but not fully reliable — on some setups (New Architecture, custom dev
clients) it can resolve before that's populated, silently falling back to
`"localhost"`, which only works if the *device itself* is the dev machine
(an iOS Simulator). **On a physical device, always pass `host` explicitly**
— your Mac's LAN IP, the same one Metro prints when it starts. If the
connection can't be established either way, check Metro's own terminal —
`attachInspector()` logs a one-time diagnostic there (`[berrylens] connecting
to ...` / a warning if it never connects), it doesn't fail silently.

## 3. Run the dashboard

In this repo (`berrylens`), from the root:

```bash
node packages/cli/dist/index.js
```

Optional `--metro <url>` — paste the Metro URL your app's dev server prints
(e.g. from `npx expo start`) — this only affects the status bar's pairing
display, it doesn't change how the SDK connects:

```bash
node packages/cli/dist/index.js --metro 192.168.1.14:8081
```

Then run your app as usual (`npx expo start`, scan the QR code / open your
dev client). Once it connects, the dashboard's status bar shows `● connected`
and events start appearing live in their panes.

## Dashboard keybindings

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Move focus between panes |
| `j`/`k` or arrow keys | Scroll within the focused pane |
| `G` | Jump back to live (if you've scrolled up) |
| `+` / `-` | Resize the focused pane |
| `z` | Zoom the focused pane to full-screen (press again to restore) |
| `Enter` | Open the full-screen detail view for the selected event (no-op if the pane is empty) |
| `n` / `p` (in detail view) | Step to next/previous event |
| `d` (in detail view) | Dump the full event JSON to a file and open `$EDITOR` |
| `Esc` (in detail view) | Back to the dashboard |
| `/` | Filter the focused pane by text |
| `?` | Global search — all categories, matches label/category/*and full payload* |
| `y` (in network detail view) | Export the request as a `curl` command — copies to clipboard and saves to a file |
| `c` | Clear all buffered events |
| `q` / `Ctrl+C` | Quit |

### Cross-pane time highlight

Scrolling through one pane marks (`▸`, bold) every event in *every other*
pane that happened at or after the selected event's timestamp — no key
needed, it just follows your selection. Useful for seeing what else was
going on from a given moment without opening the detail view: select an API
call in API CALLS, and GLOBAL STATE/QUERY CACHE/etc. immediately show which
of their own events came after it.

**`J`/`K`** (Shift+j/k, or Shift+↑/↓ where your terminal forwards it) extends
this into a bounded range instead of an open-ended one: press it once to
anchor the range at wherever the cursor already was, then keep pressing to
move the other end — the focused pane's title shows `(range: N)` and
highlights every row between the two ends (inclusive), while every other
pane marks events falling *inside* that time span rather than just after a
single point. A plain `j`/`k`, changing focus with `Tab`, or `c` collapses
it back to a normal single selection.

The detail view (`Enter`) replaces the whole dashboard, not squeezed below
it. Non-network events get the full payload as a collapsible JSON tree. The
dashboard itself uses the terminal's alternate screen buffer, same as
`vim`/`htop`/`less` — your shell's scrollback is untouched and restored
automatically when you quit.

### Network detail view: A/B/C panels

Network events get a 3-panel layout instead of the generic tree view:

```
╭─ A: REQUEST (25% height, full width) ─────────────────────╮
│ method/url · status/duration · request headers            │
╰──────────────────────────────────────────────────────────╯
╭─ B: REQUEST BODY or QUERY PARAMS ─╮╭─ C: RESPONSE ────────╮
│ (50% width)                       ││ (50% width)          │
╰────────────────────────────────────╯╰──────────────────────╯
```

- **B** shows the request body when one was actually captured; when there
  isn't one (the common GET case — this is based on whether a body was
  captured, not on the method name, since that's the more robust signal),
  it shows the URL's query params instead, since that's the closer
  equivalent of "what did we send" for a bodyless request.
- **Every panel scrolls independently**, height-bounded to its own space —
  a long response body scrolls inside panel C, it doesn't push the terminal
  itself into scroll.
- **`Tab` cycles keyboard focus between A → B → C** (`Shift+Tab` goes
  backwards) — only the focused panel responds to scroll/expand keys, so
  they don't fight over input.

### Inside the detail view: JSON tree

The payload (or a network event's response body) renders as a collapsible
tree (jless/fx-style) rather than a raw dump — the root's direct keys are
visible immediately, nested objects/arrays start collapsed as `{2 keys}` /
`[3 items]` so a big payload doesn't arrive as an unreadable wall of text,
but nothing is hidden or truncated — it's all there, just collapsed until
you ask for it.

| Key | Action |
| --- | --- |
| `↑`/`↓` or `j`/`k` | Move the cursor between visible tree lines |
| `→`/`l` or `Enter` | Expand the container under the cursor |
| `←`/`h` | Collapse it |
| `v` | Toggle to the raw pretty-printed JSON (press again to go back to the tree) |

### Correlation strip: "what else happened around this"

Every detail view (generic, network, and state/diff) ends with a small
**NEARBY (±500ms)** strip — every event across *every* category within half
a second of the one you're looking at, in chronological order, the selected
event marked with `▶`. This is the actual point of the tool: reconstructing
a causal chain (tap → API call → query invalidated → state updated → nav) in
one glance instead of manually eyeballing timestamps across 5 separate panes.

### Global search (`?`)

`/` filters the *focused* pane only. `?` opens a full-screen search across
**every** category at once, and matches aren't limited to the label — it
searches the full payload too, so "where did this token/user ID/error
message show up" finds it even when it's buried in a request body or a state
snapshot. `↑`/`↓` to move between matches, `Enter` opens the real detail view
for whichever one's selected (jumping there even if that pane currently has
an unrelated filter active), `Esc` cancels.

### curl export (`y`, network detail view only)

Press `y` while looking at a network event's detail view to export it as a
runnable `curl` command — method, headers, and body, shell-escaped safely.
It's copied to your system clipboard (macOS/Linux/Windows, best-effort — a
missing clipboard tool just falls back silently) and always written to a
file regardless, so "I see the failing request" becomes "I can replay/tweak
it outside the app" in one keystroke. Confirmation shows briefly in the
status bar.

### State diff view

A state event with a captured diff (Redux and Zustand both capture this
automatically — no setup needed beyond the normal `reduxStore`/`inspectStore`
attach) gets a **CHANGED** section up front: each changed key shown as
`key  oldValue  →  newValue`, not just "something changed, go compare two
full snapshots yourself." The full new-state tree is still available below
it via the usual collapsible tree. Falls back to the generic tree view for
state events without a diff (e.g. from a custom source that doesn't capture
one).

### Error signaling

Errors show a red `⚠ N errors` counter in the status bar — visible
regardless of which pane you're looking at, so you don't have to be staring
at CONSOLE/ERRORS specifically to notice one happened. It briefly flashes
inverse/bold for a couple of seconds right when a new one lands, then
settles into the plain counter (which stays until you `c` clear).

## Troubleshooting

- **Dashboard stays on "waiting for connection"**: confirm your phone/simulator
  and the machine running `berrylens-cli` are reachable from each other (same
  Wi-Fi, no VPN/client isolation), and that you actually added the
  `attachInspector()` call — Metro's own terminal logs are separate from this
  and don't imply the SDK is wired in.
- **macOS Firewall prompt**: the first time the CLI's WebSocket server starts,
  macOS may ask to allow incoming connections for `node` — click Allow, or a
  physical device won't be able to reach it.
- **Physical device, not simulator**: use `npx expo start` in default LAN mode
  (not `--tunnel` — that routes through an external domain the CLI can't
  reach).
