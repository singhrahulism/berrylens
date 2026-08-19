#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { InspectorServer } from "./server.js";
import { parseMetroUrl } from "./metroPairing.js";
import { App } from "./ui/App.js";

const port = Number(process.env.BERRYLENS_PORT ?? 7890);

const metroFlagIndex = process.argv.indexOf("--metro");
const metroUrl = metroFlagIndex !== -1 ? process.argv[metroFlagIndex + 1] : undefined;
const metroTarget = metroUrl ? parseMetroUrl(metroUrl) : null;
if (metroUrl && !metroTarget) {
  console.warn(`[berrylens] could not parse --metro url: ${metroUrl}`);
}

// Alternate screen buffer — same trick vim/htop/less use: swap to a clean
// screen on start and restore the user's original scrollback exactly as it
// was on exit, rather than destructively clearing their shell history.
const ENTER_ALT_SCREEN = "\x1B[?1049h";
const EXIT_ALT_SCREEN = "\x1B[?1049l";
process.stdout.write(ENTER_ALT_SCREEN);
process.on("exit", () => {
  process.stdout.write(EXIT_ALT_SCREEN);
});

const server = new InspectorServer({ port });

const { waitUntilExit } = render(<App server={server} metroTarget={metroTarget} />);

waitUntilExit().then(() => {
  server.close();
  process.exit(0);
});
