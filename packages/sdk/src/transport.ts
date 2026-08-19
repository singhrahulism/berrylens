import type { ClientMessage, InspectorEvent } from "@berrylens/protocol";

export interface TransportOptions {
  host: string;
  port: number;
  appName: string;
  platform: string;
  maxBufferSize?: number;
  reconnectDelayMs?: number;
}

const OPEN = 1;

/**
 * Dials out to the CLI's relay server and never lets connection trouble surface
 * to the host app: buffers while disconnected (dropping oldest past a cap) and
 * retries on a fixed delay. Does log a one-time diagnostic to the real console
 * on connect/first-failure though — a silent, endlessly-retrying connection
 * with zero signal either way is genuinely hard to debug (host resolution
 * guessed wrong vs. a network/firewall block look identical from the app's
 * side), so this is worth the one line of noise.
 */
export class Transport {
  private ws: WebSocket | null = null;
  private readonly buffer: InspectorEvent[] = [];
  private closed = false;
  private everConnected = false;
  private hasWarnedNeverConnected = false;
  private readonly maxBufferSize: number;
  private readonly reconnectDelayMs: number;
  private readonly target: string;

  constructor(private readonly opts: TransportOptions) {
    this.maxBufferSize = opts.maxBufferSize ?? 500;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 1000;
    this.target = `ws://${opts.host}:${opts.port}`;
    // eslint-disable-next-line no-console
    console.log(`[berrylens] connecting to ${this.target} ...`);
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    try {
      const ws = new WebSocket(this.target);
      this.ws = ws;
      ws.addEventListener("open", () => {
        if (!this.everConnected) {
          this.everConnected = true;
          // eslint-disable-next-line no-console
          console.log(`[berrylens] connected to ${this.target}`);
        }
        this.sendRaw({ type: "hello", appName: this.opts.appName, platform: this.opts.platform });
        this.flush();
      });
      ws.addEventListener("close", () => {
        this.warnIfNeverConnected();
        this.scheduleReconnect();
      });
      ws.addEventListener("error", () => {
        this.warnIfNeverConnected();
        try {
          ws.close();
        } catch {
          // already closing
        }
      });
    } catch {
      this.warnIfNeverConnected();
      this.scheduleReconnect();
    }
  }

  private warnIfNeverConnected(): void {
    if (this.everConnected || this.hasWarnedNeverConnected) return;
    this.hasWarnedNeverConnected = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[berrylens] could not reach ${this.target} — retrying in the background. ` +
        'If this never connects: pass an explicit host, e.g. attachInspector({ host: "192.168.1.14" }) ' +
        "(your Mac's LAN IP), and confirm your device/simulator can reach that address — same Wi-Fi network, " +
        "no VPN/client isolation, and macOS Firewall allowing incoming connections for node.",
    );
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    setTimeout(() => this.connect(), this.reconnectDelayMs);
  }

  private sendRaw(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch {
        // dev tool must never throw into the host app
      }
    }
  }

  emit(event: InspectorEvent): void {
    if (this.ws && this.ws.readyState === OPEN) {
      this.sendRaw({ type: "event", event });
    } else {
      this.buffer.push(event);
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift();
      }
    }
  }

  private flush(): void {
    const pending = this.buffer.splice(0, this.buffer.length);
    for (const event of pending) {
      this.sendRaw({ type: "event", event });
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
