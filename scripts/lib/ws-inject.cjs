// Connects to a running berrylens CLI's WebSocket server and sends a
// sequence of protocol messages (hello/event), same shape the real SDK
// sends. Used by scripts/live-verify.py to feed synthetic events into a
// pty-driven CLI instance without needing a real React Native app.
//
// Usage: node ws-inject.cjs <port> <messages-json-file>
// messages-json-file: a JSON array of message objects, each one either
//   { "type": "hello", "appName": "...", "platform": "..." }
//   { "type": "event", "event": { ...InspectorEvent } }

const fs = require("fs");
const WebSocket = require("ws");

const port = process.argv[2];
const messagesFile = process.argv[3];

if (!port || !messagesFile) {
  console.error("usage: node ws-inject.cjs <port> <messages-json-file>");
  process.exit(1);
}

const messages = JSON.parse(fs.readFileSync(messagesFile, "utf8"));

const ws = new WebSocket(`ws://localhost:${port}`);

ws.on("open", () => {
  for (const message of messages) {
    ws.send(JSON.stringify(message));
  }
  setTimeout(() => process.exit(0), 200);
});

ws.on("error", (err) => {
  console.error("ws-inject error:", err.message);
  process.exit(1);
});
