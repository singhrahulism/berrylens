---
name: architecture
description: Use whenever creating, modifying, or refactoring code in this repository (berrylens).
---

# What this project is

berrylens is a dev-time runtime inspector for React Native: an SDK that patches
fetch/console/errors/AsyncStorage inside the target app, and a terminal
dashboard (Ink/React) that renders what it captures. Full product context
lives in `plan/mvp-plan.md` and `plan/phases.md` (the phase-by-phase build
log, read its "Current state summary" section first). This file is about how
the code is organized and the conventions to follow when touching it, not
what the product does.

# Philosophy

Before creating any file, find the closest existing example and follow its
shape. If no precedent exists, ask instead of inventing a new pattern.

Every capture source, adapter, patch, and view in this codebase follows one
of a small number of established shapes (see below). A new one should look
like the others, not introduce a fourth way to do the same job.

# Monorepo layout

npm workspaces, three packages plus an example app:

```
packages/
  protocol/   shared TypeScript types, zero runtime deps
  sdk/        the library the target RN app depends on (npm name: berrylens)
  cli/        the dev-machine dashboard (npm name: berrylens-cli, bin: berrylens)
example/      a minimal Expo app wired with attachInspector(), used for
              manual end-to-end verification, not part of the build chain
scripts/      standalone repo-maintenance scripts, see scripts/README.md
plan/         design docs and the phase-by-phase build log
```

`berrylens` (sdk) is an ordinary npm dependency of the target app.
`berrylens-cli` is a standalone tool the developer runs on their own machine;
it is never a dependency of the target app. Keep this distinction in mind
before adding an import across that boundary; the two only ever talk over the
WebSocket protocol defined in `packages/protocol`.

# Module resolution and build (read before adding an import)

`protocol` and `sdk` compile as CommonJS (`moduleResolution: Node`, classic
resolution): relative imports have no file extension, e.g.
`export { generateId } from "./id"`. Their `build` script is plain `tsc`.

`cli` is ESM (`"type": "module"` in its `package.json`), forced by `ink`,
which ships no CommonJS build. Its `build` script is `tsup` (esbuild-based
bundling into a single `dist/index.js`), not `tsc`. Because tsup resolves and
inlines internal relative imports at build time, those imports also have no
file extension inside `packages/cli/src`. `tsc` is still run there, but only
for typechecking (`npm run typecheck -w berrylens-cli`, `moduleResolution:
Bundler`, `noEmit: true`); it does not produce the shipped output.

Do not add a `.js` extension to a relative import anywhere in this repo. If
you see one, it is stale from before this was fixed, not a pattern to copy.

# File size guideline

No source file should exceed 200 lines, with a 15 percent tolerance (230
lines is the hard ceiling in practice). Line count means total physical
lines (`wc -l`), the same count an editor's line indicator shows, not a
stripped "code only" count with blank lines and comments excluded. This does
not apply to test files or Markdown (including everything under `plan/`).
Check with `scripts/check-file-size.sh` before considering a file-adding or
file-growing change done.

When a file is approaching the limit, split by concept, not by mechanically
cutting in half. The `packages/cli/src/ui/App.tsx` split is the reference
example: the original file mixed the React component, the reducer, the
state/action types, and every keyboard-driven transition in one place. It
became four files, each with one job:

```
appState.ts   AppState/AppEvent types, initialState, pure selection helpers
keyHandler.ts every keyboard-driven state transition (handleKey)
reducer.ts    the top-level reducer; the only file depending on both of the above
App.tsx       the React component: effects, useInput wiring, rendering
```

The dependency direction matters: `appState.ts` depends on neither of the
other two, `keyHandler.ts` depends only on `appState.ts`, and `reducer.ts` is
the single file allowed to import from both. Keep new splits acyclic the same
way; a circular import between two sibling files is a sign the split was
along the wrong seam.

# SDK architecture (packages/sdk)

Everything the SDK captures, whether a zero-config patch (network, console,
errors, storage) or a library adapter (Redux, React Query, React Navigation,
Zustand), implements one interface:

```ts
type Emit = (event: InspectorEvent) => void;

interface Capture {
  name: string;
  install(emit: Emit): () => void; // returns uninstall
}
```

Each implementation is self-contained and independently unit-testable with a
fake `emit` function and mocked globals or instances. Defensiveness is
centralized rather than reimplemented per file: every emitted event goes
through `safeEmit(emit, event)` (`capture.ts`, a try/catch around the call to
`emit`), and `attachInspector()` calls every capture's `install()` through its
own `safeInstall()` wrapper, so a throwing `install()` or a throwing consumer
of `emit` can never take down the app or any other capture. A new patch or
adapter should call `safeEmit`, not add its own try/catch around `emit`.
`attachInspector()` is otherwise a thin orchestrator: build the transport,
instantiate whichever captures apply, call `install(emit)` on each. A new
capture source should be a new file under `patches/` or `adapters/`
implementing this interface, not a special case bolted onto
`attachInspector()`.

Patches must be defensive by construction: never throw into the host app,
never alter the real call's behavior or mutate response bodies (the network
patch clones responses rather than consuming them).

Library adapters that need a live instance not available at
`attachInspector()` call time (most concretely, `navigationRef` under
expo-router, which only exists inside a mounted component) are attached later
via `inspector.attach(someAdapter(...))`, not forced into the initial call
signature.

# CLI architecture (packages/cli)

`InspectorServer` (`server.ts`) extends Node's `EventEmitter` and is the bus
at the center: it emits `event`/`hello`/`connection`/`disconnection`, and
keeps a bounded in-memory history (`getHistory()`) so late-attaching UI still
sees prior events. `App.tsx` is the only consumer today, subscribing via
`server.on(...)`. `server.ts`'s own comment notes native log tailing (`adb
logcat`/`simctl log stream`) as a planned second producer onto the same bus,
same `InspectorEvent` shape, no UI changes needed, but as of this writing
that producer does not exist yet (there is no `nativeLogs.ts` in the repo).
Don't reference it as already implemented; check `packages/cli/src` before
assuming a planned file from `plan/phases.md` was actually built.

The UI layer (`packages/cli/src/ui`) is presentational panes over shared
state, structured as:

```
ui/
  App.tsx, appState.ts, keyHandler.ts, reducer.ts   the app shell (see above)
  detailKeyEffects.ts    dump/curl side effects triggered from detail mode
  keymap.ts       single source of truth for keybindings, one resolveAction()
  paneConfig.ts   pane/category/layout definitions
  theme.ts        category color map
  layout.ts       grid and scroll-window math, shared across panes and overlays
  components/     presentational React components (Pane, DetailOverlay, etc.)
  views/          self-contained per-feature logic, each with its own test
                  (correlation.ts, curl.ts, json-tree.ts, search.ts, timeline.ts)
  utils/          small cross-cutting helpers (clipboard.ts, dump.ts)
```

Rule of thumb for where a new file goes: if it is shared infrastructure most
of the UI depends on, it belongs at the top of `ui/`. If it backs exactly one
feature and is pure/testable on its own, it belongs in `views/`. If it is a
small helper with no UI-specific logic, it belongs in `utils/`. If it renders
something, it belongs in `components/`.

Components never touch the event bus or read from the server directly: data
always arrives as props from `App.tsx`. This is what keeps
`ink-testing-library` tests simple: a component test only needs to pass
props, not stand up a fake server. This does not mean every component is
free of local state: `JsonViewer`, `ScrollableLines`, and
`NetworkDetailOverlay` each keep real local `useState` (tree expand-paths,
cursor position, scroll offset, focused sub-panel); see the Keybindings
section of the design-system skill for why that state stays local rather
than moving into `AppState`, and how keystrokes still reach it without any
component calling `useInput` itself.

# Comments

Default to no comments. Add one only when the reasoning behind the code is
not obvious from reading it: a non-obvious constraint, a workaround for a
specific bug, a subtle invariant, or behavior that would surprise a reader.
Never write a comment that restates what the code already says. Look at any
existing file in this repo for the calibration: comments here explain "why",
never "what".

# Testing conventions

Tests are colocated next to the source they test (`Pane.tsx` beside
`Pane.test.tsx`, `curl.ts` beside `curl.test.ts`), not in a separate `tests/`
tree. SDK patches and adapters are tested with a fake `emit` function and
mocked globals or instances, which is the actual payoff of the `Capture`
interface: each one tests in isolation with no real network/storage/library
required. CLI components and app-level flows are tested with
`ink-testing-library`, rendering the real `App` component and asserting on
`lastFrame()` output plus simulated `stdin.write()` keystrokes, not by
testing the reducer or keymap in isolation from rendering.

Pure logic (grid math, scroll windows, diffs, search matching, curl building)
gets plain `vitest` unit tests with no rendering involved, colocated the same
way.

# Before finishing a change

Does it match the shape of the nearest existing file doing a similar job?
Does it introduce a new pattern where an existing one would do? Run
`npm run build`, `npx vitest run`, and `scripts/check-file-size.sh` before
considering the change done, not just `tsc --noEmit`.
