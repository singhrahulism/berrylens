/** Header/body parsing shared by the fetch and XHR patches in `network.ts` — kept
 * separate since neither patch function needs to know how any of this works. */

export function headersToObject(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  try {
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      const result: Record<string, string> = {};
      headers.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return { ...(headers as Record<string, string>) };
  } catch {
    return undefined;
  }
}

export function describeRequestBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  try {
    if (typeof body === "string") return tryParseJSON(body);
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const entries: Record<string, unknown> = {};
      body.forEach((value, key) => {
        entries[key] = typeof value === "string" ? value : "[binary]";
      });
      return entries;
    }
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return Object.fromEntries(body.entries());
    }
    const ctorName = (body as { constructor?: { name?: string } })?.constructor?.name ?? typeof body;
    return `[${ctorName}]`;
  } catch {
    return undefined;
  }
}

export async function describeResponseBody(response: Response): Promise<unknown> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (isLikelyBinary(contentType)) return `[binary omitted: ${contentType}]`;
    // clone so the app's own .json()/.text() call still gets an unconsumed body
    const text = await response.clone().text();
    return tryParseJSON(text);
  } catch {
    return undefined;
  }
}

export function parseXHRResponseHeaders(xhr: XMLHttpRequest): Record<string, string> | undefined {
  try {
    const raw = xhr.getAllResponseHeaders();
    if (!raw) return undefined;
    const result: Record<string, string> = {};
    for (const line of raw.trim().split(/[\r\n]+/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  } catch {
    return undefined;
  }
}

export function describeXHRResponseBody(xhr: XMLHttpRequest): unknown {
  try {
    if (xhr.responseType === "" || xhr.responseType === "text") return tryParseJSON(xhr.responseText);
    if (xhr.responseType === "json") return xhr.response;
    return `[${xhr.responseType || "binary"} omitted]`;
  } catch {
    return undefined;
  }
}

function isLikelyBinary(contentType: string): boolean {
  return (
    /^(image|audio|video|font)\//.test(contentType) ||
    contentType.includes("octet-stream") ||
    contentType.includes("pdf") ||
    contentType.includes("zip")
  );
}

function tryParseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
