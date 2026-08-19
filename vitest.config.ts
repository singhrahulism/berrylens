import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `ink` is deliberately forced (via the root package.json "overrides") to nest
// under packages/cli/node_modules so its bundled react-reconciler@0.29.x (React
// 18-compatible) binds to the SAME React 18 instance packages/cli's own source
// uses — otherwise it'd bind to whatever React got hoisted to the workspace
// root (React 19, pulled in by the example Expo app), causing a
// "Cannot read properties of undefined (reading 'ReactCurrentOwner')" crash
// from two incompatible React instances meeting at runtime.
// `ink-testing-library` has no *formal* dependency on `ink` for npm to nest
// consistently alongside it, so it stays hoisted at the root and would
// otherwise resolve a different (or missing) `ink` — this alias forces it
// (and anything else) to resolve the one true nested copy instead.
const cliInkPath = fileURLToPath(new URL("./packages/cli/node_modules/ink", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      ink: cliInkPath,
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
    // forces these through Vite's own resolution pipeline (where the alias
    // above applies) instead of Node's native ESM loader, which otherwise
    // bypasses the alias entirely for prebuilt node_modules packages
    server: {
      deps: {
        inline: ["ink-testing-library"],
      },
    },
  },
});
