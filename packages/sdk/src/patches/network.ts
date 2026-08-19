import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";
import {
  describeRequestBody,
  describeResponseBody,
  describeXHRResponseBody,
  headersToObject,
  parseXHRResponseHeaders,
} from "./networkBody";

// durationMs is carried on the event's own `durationMs` field, not baked into
// the label, so consumers that render it separately (e.g. a DUR column) don't
// end up showing it twice.
function summarize(method: string, url: string, status?: number): string {
  const parts = [method.toUpperCase(), url];
  if (status !== undefined) parts.push(String(status));
  return parts.join(" ");
}

/**
 * Covers fetch and XHR (which is what Axios uses in RN by default), so both
 * are captured without any per-call instrumentation from the app. Captures
 * full headers and bodies, uncapped/untruncated — this is a debugging tool,
 * verbosity is the point. The one exception is skipping *reading* bodies that
 * look binary (images, fonts, archives, etc.) by content-type, since decoding
 * those as text would just produce garbage, not useful debug output.
 */
export const networkCapture: Capture = {
  name: "network",
  install(emit: Emit) {
    const disposers = [patchFetch(emit), patchXHR(emit)];
    return () => disposers.forEach((dispose) => dispose());
  },
};

function patchFetch(emit: Emit): () => void {
  const g = globalThis as typeof globalThis & { fetch?: typeof fetch };
  const original = g.fetch;
  if (typeof original !== "function") return () => {};

  g.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const start = Date.now();
    const method = (
      init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : undefined) ?? "GET"
    ).toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const requestHeaders = headersToObject(init?.headers);
    const requestBody = describeRequestBody(init?.body);

    try {
      const response = await original(input as RequestInfo, init);
      const durationMs = Date.now() - start;
      const responseHeaders = headersToObject(response.headers);
      const responseBody = await describeResponseBody(response);
      safeEmit(emit, {
        id: generateId(),
        timestamp: start,
        category: "network",
        label: summarize(method, url, response.status),
        durationMs,
        data: { method, url, status: response.status, ok: response.ok, requestHeaders, requestBody, responseHeaders, responseBody },
      });
      return response;
    } catch (err) {
      const durationMs = Date.now() - start;
      safeEmit(emit, {
        id: generateId(),
        timestamp: start,
        category: "network",
        label: `${summarize(method, url)} failed`,
        durationMs,
        data: { method, url, requestHeaders, requestBody, error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  } as typeof fetch;

  return () => {
    g.fetch = original;
  };
}

interface XHRMeta {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
}

function patchXHR(emit: Emit): () => void {
  const g = globalThis as typeof globalThis & { XMLHttpRequest?: typeof XMLHttpRequest };
  const XHR = g.XMLHttpRequest;
  if (typeof XHR !== "function") return () => {};

  const originalOpen = XHR.prototype.open;
  const originalSend = XHR.prototype.send;
  const originalSetRequestHeader = XHR.prototype.setRequestHeader;

  XHR.prototype.open = function patchedOpen(
    this: XMLHttpRequest & { __berrylens?: XHRMeta },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this.__berrylens = { method, url: String(url) };
    return (originalOpen as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
  } as typeof XHR.prototype.open;

  XHR.prototype.setRequestHeader = function patchedSetRequestHeader(
    this: XMLHttpRequest & { __berrylens?: XHRMeta },
    name: string,
    value: string,
  ) {
    if (this.__berrylens) {
      this.__berrylens.requestHeaders = this.__berrylens.requestHeaders ?? {};
      this.__berrylens.requestHeaders[name] = value;
    }
    return (originalSetRequestHeader as (...args: unknown[]) => void).apply(this, [name, value]);
  } as typeof XHR.prototype.setRequestHeader;

  XHR.prototype.send = function patchedSend(this: XMLHttpRequest & { __berrylens?: XHRMeta }, ...args: unknown[]) {
    const meta = this.__berrylens;
    const start = Date.now();
    if (meta) {
      const requestBody = describeRequestBody(args[0] as BodyInit | null | undefined);
      this.addEventListener("loadend", () => {
        const durationMs = Date.now() - start;
        safeEmit(emit, {
          id: generateId(),
          timestamp: start,
          category: "network",
          label: summarize(meta.method, meta.url, this.status),
          durationMs,
          data: {
            method: meta.method,
            url: meta.url,
            status: this.status,
            requestHeaders: meta.requestHeaders,
            requestBody,
            responseHeaders: parseXHRResponseHeaders(this),
            responseBody: describeXHRResponseBody(this),
          },
        });
      });
    }
    return (originalSend as (...args: unknown[]) => void).apply(this, args);
  } as typeof XHR.prototype.send;

  return () => {
    XHR.prototype.open = originalOpen;
    XHR.prototype.send = originalSend;
    XHR.prototype.setRequestHeader = originalSetRequestHeader;
  };
}
