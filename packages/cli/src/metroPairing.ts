export interface MetroTarget {
  raw: string;
  host: string;
}

/** Parses `--metro <url>` — accepts a full URL or a bare `host:port`. */
export function parseMetroUrl(url: string): MetroTarget | null {
  try {
    const parsed = new URL(url.includes("://") ? url : `http://${url}`);
    if (!parsed.hostname) return null;
    return { raw: url, host: normalizeHost(parsed.hostname) };
  } catch {
    return null;
  }
}

export type PairingStatus = "match" | "device-connected" | "unexpected-local" | "unknown";

/**
 * A strict host-equality "match" only makes sense when Metro itself is on
 * loopback (simulator/emulator, which shares the Mac's localhost) — there,
 * a connecting device that *isn't* loopback is worth flagging. For a LAN
 * Metro host (physical device testing), the connecting device's IP is a
 * *different* machine by design (the phone, not the Mac) and will never
 * equal the Metro host even when everything is working correctly — so that
 * case just reports the connected device's address as info, not a mismatch.
 */
export function describePairing(expectedHost: string, actualHost: string | undefined): PairingStatus {
  if (!actualHost) return "unknown";
  const expected = normalizeHost(expectedHost);
  const actual = normalizeHost(actualHost);
  if (expected === actual) return "match";
  if (expected === "localhost") return "unexpected-local";
  return "device-connected";
}

function normalizeHost(host: string): string {
  const lower = host.toLowerCase();
  return lower === "127.0.0.1" || lower === "::1" ? "localhost" : lower;
}
