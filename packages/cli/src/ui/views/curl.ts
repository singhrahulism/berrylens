export interface NetworkEventDataForCurl {
  method?: string;
  url?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
}

/** Builds a shell-safe `curl` command reproducing a captured network request. */
export function buildCurlCommand(data: NetworkEventDataForCurl): string {
  const parts: string[] = ["curl"];
  const method = (data.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    parts.push("-X", shellQuote(method));
  }
  if (data.requestHeaders) {
    for (const [key, value] of Object.entries(data.requestHeaders)) {
      parts.push("-H", shellQuote(`${key}: ${value}`));
    }
  }
  if (data.requestBody !== undefined) {
    const bodyString = typeof data.requestBody === "string" ? data.requestBody : JSON.stringify(data.requestBody);
    parts.push("-d", shellQuote(bodyString));
  }
  parts.push(shellQuote(data.url ?? ""));
  return parts.join(" ");
}

/** POSIX single-quote wrap — safe against any special characters in headers/body/URL, not just the common ones. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
