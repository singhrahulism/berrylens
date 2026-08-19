import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, HelloMessage, InspectorEvent } from "@berrylens/protocol";

export interface InspectorServerOptions {
  port: number;
  /** Bounded scrollback so late-attaching UI / reconnects still have history. */
  maxBufferedEvents?: number;
}

export interface ConnectionInfo {
  remoteAddress?: string;
}

/**
 * The event bus sits at the center: this server is just one producer onto it
 * (the other, added in a later phase, is native log tailing). Everything
 * downstream sees a plain InspectorEvent stream with no notion of source.
 */
export class InspectorServer extends EventEmitter {
  private readonly wss: WebSocketServer;
  private readonly history: InspectorEvent[] = [];
  private readonly maxBufferedEvents: number;

  constructor(options: InspectorServerOptions) {
    super();
    this.maxBufferedEvents = options.maxBufferedEvents ?? 5000;
    this.wss = new WebSocketServer({ port: options.port });
    this.wss.on("connection", (socket, request) => this.handleConnection(socket, request));
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    this.emit("connection", { remoteAddress: request.socket.remoteAddress } satisfies ConnectionInfo);
    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === "hello") {
        this.emit("hello", message as HelloMessage);
      } else if (message.type === "event") {
        this.recordEvent(message.event);
      }
    });
    socket.on("close", () => this.emit("disconnection"));
  }

  private recordEvent(event: InspectorEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxBufferedEvents) {
      this.history.shift();
    }
    this.emit("event", event);
  }

  getHistory(): InspectorEvent[] {
    return [...this.history];
  }

  close(): void {
    this.wss.close();
  }
}
