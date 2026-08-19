import { describe, expect, it } from "vitest";
import { buildCurlCommand } from "./curl";

describe("buildCurlCommand", () => {
  it("builds a plain GET with no -X flag", () => {
    const cmd = buildCurlCommand({ method: "GET", url: "https://api.example.com/users" });
    expect(cmd).toBe("curl 'https://api.example.com/users'");
  });

  it("includes -X for non-GET methods", () => {
    const cmd = buildCurlCommand({ method: "POST", url: "https://api.example.com/wave" });
    expect(cmd).toContain("-X 'POST'");
  });

  it("includes headers as -H flags", () => {
    const cmd = buildCurlCommand({
      method: "GET",
      url: "https://api.example.com/me",
      requestHeaders: { Authorization: "Bearer abc123", Accept: "application/json" },
    });
    expect(cmd).toContain("-H 'Authorization: Bearer abc123'");
    expect(cmd).toContain("-H 'Accept: application/json'");
  });

  it("serializes an object request body as JSON with -d", () => {
    const cmd = buildCurlCommand({ method: "POST", url: "https://api.example.com/wave", requestBody: { targetUserId: "442" } });
    expect(cmd).toContain(`-d '${JSON.stringify({ targetUserId: "442" })}'`);
  });

  it("passes a string request body through as-is", () => {
    const cmd = buildCurlCommand({ method: "POST", url: "https://api.example.com/x", requestBody: "raw-body" });
    expect(cmd).toContain("-d 'raw-body'");
  });

  it("omits -d entirely when there's no request body", () => {
    const cmd = buildCurlCommand({ method: "GET", url: "https://api.example.com/x" });
    expect(cmd).not.toContain("-d");
  });

  it("shell-escapes embedded single quotes safely", () => {
    const cmd = buildCurlCommand({ method: "GET", url: "https://api.example.com/x", requestHeaders: { "X-Note": "it's fine" } });
    expect(cmd).toContain("-H 'X-Note: it'\\''s fine'");
  });
});
