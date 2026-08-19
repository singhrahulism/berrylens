import { defineConfig } from "tsup";

/**
 * `berrylens-cli` is a bin-only tool (never imported as a library — see
 * `plan/mvp-plan.md`'s distribution model), so a single bundled entry with no
 * `.d.ts` output is enough. Bundling (rather than `tsc`'s per-file emit) is
 * what lets internal relative imports stay extensionless: esbuild resolves
 * and inlines them at build time, so Node's ESM loader never has to resolve
 * a relative specifier at runtime — only `import`s of real dependencies
 * (react, ink, ws, @berrylens/protocol) survive into the output.
 */
export default defineConfig({
  entry: ["src/index.tsx"],
  format: "esm",
  target: "node18",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  shims: false,
  external: ["react", "ink", "ws", "@berrylens/protocol"],
});
