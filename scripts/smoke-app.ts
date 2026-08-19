/**
 * Stand-in for a React Native app for Phase 1 verification, run against a
 * live `berrylens` CLI instance. Exercises fetch (network) + console
 * (console/error) capture. ErrorUtils and `unhandledrejection` are RN/browser
 * globals not present in plain Node, so the error-handler path is only
 * fully exercised once the example RN app exists (Phase 4).
 */
import { attachInspector } from "berrylens";

const inspector = attachInspector({ host: "localhost", port: 7890, appName: "smoke-app" });

async function main() {
  console.log("smoke app starting");
  console.warn("a warning message");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch("https://example.com", { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    console.error("fetch failed", err);
  }

  console.log("smoke app done, exiting in 1s");
  setTimeout(() => {
    inspector.detach();
    process.exit(0);
  }, 1000);
}

main();
