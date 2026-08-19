import { describe, expect, it } from "vitest";
import { parseMetroUrl, describePairing } from "./metroPairing";

describe("parseMetroUrl", () => {
  it("extracts host from a full URL", () => {
    expect(parseMetroUrl("http://192.168.1.23:8081")?.host).toBe("192.168.1.23");
  });

  it("extracts host from a bare host:port", () => {
    expect(parseMetroUrl("localhost:8081")?.host).toBe("localhost");
  });

  it("returns null for input with no hostname", () => {
    expect(parseMetroUrl("")).toBeNull();
  });
});

describe("describePairing", () => {
  it("returns 'unknown' when no device has connected yet", () => {
    expect(describePairing("localhost", undefined)).toBe("unknown");
  });

  it("returns 'match' for a simulator on the same loopback host (127.0.0.1 vs localhost)", () => {
    expect(describePairing("localhost", "127.0.0.1")).toBe("match");
  });

  it("returns 'match' for identical LAN hosts, case-insensitively", () => {
    expect(describePairing("MyHost", "myhost")).toBe("match");
  });

  it("returns 'unexpected-local' when Metro is loopback but a different device connected", () => {
    expect(describePairing("localhost", "192.168.1.99")).toBe("unexpected-local");
  });

  it("returns 'device-connected' (not a mismatch) for a physical device on a LAN Metro host", () => {
    // this is the real-device case: Metro runs on the Mac's LAN IP, the
    // connecting device is the phone's IP — different by design, not an error
    expect(describePairing("192.168.1.23", "192.168.1.50")).toBe("device-connected");
  });
});
