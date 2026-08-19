import React from "react";
import { Box, Text } from "ink";
import type { MetroTarget } from "../../metroPairing";
import { describePairing } from "../../metroPairing";

export interface StatusBarProps {
  connectionStatus: "waiting" | "connected" | "disconnected";
  appInfo: { appName: string; platform: string } | null;
  metroTarget: MetroTarget | null;
  remoteAddress?: string;
  eventCount: number;
  /** Transient confirmation (e.g. "curl copied to clipboard") — shown here since
   * it's the one place visible regardless of grid/detail mode, and clears itself
   * after a few seconds. */
  statusMessage?: string | null;
  /** Total error-category events so far — shown here so you never have to be
   * looking at CONSOLE/ERRORS specifically to notice one happened. */
  errorCount: number;
  /** True for a few seconds right after a new error lands — renders the
   * indicator inverse/bold so a fresh error is genuinely hard to miss, not
   * just present in a corner you weren't looking at. */
  errorFlashActive: boolean;
}

export function StatusBar({
  connectionStatus,
  appInfo,
  metroTarget,
  remoteAddress,
  eventCount,
  statusMessage,
  errorCount,
  errorFlashActive,
}: StatusBarProps) {
  const connectionLabel =
    connectionStatus === "connected" && appInfo
      ? `● connected  ${appInfo.appName} (${appInfo.platform})`
      : connectionStatus === "disconnected"
        ? "○ disconnected"
        : "○ waiting for connection";

  const metroInfo = metroTarget ? describeMetroInfo(metroTarget, remoteAddress) : "";

  return (
    <Box justifyContent="space-between" paddingX={1}>
      {statusMessage ? (
        <Text color="green">✓ {statusMessage}</Text>
      ) : (
        <Text color={connectionStatus === "connected" ? "green" : "yellow"}>{connectionLabel}</Text>
      )}
      <Box>
        {errorCount > 0 ? (
          <Text color="red" bold={errorFlashActive} inverse={errorFlashActive}>
            ⚠ {errorCount} error{errorCount === 1 ? "" : "s"}
          </Text>
        ) : null}
        <Text dimColor>
          {errorCount > 0 ? "  " : ""}
          {metroInfo ? `${metroInfo}  ` : ""}
          {eventCount} events
        </Text>
      </Box>
    </Box>
  );
}

function describeMetroInfo(metroTarget: MetroTarget, remoteAddress: string | undefined): string {
  const status = describePairing(metroTarget.host, remoteAddress);
  switch (status) {
    case "match":
      return `metro: ${metroTarget.host} ✓`;
    case "device-connected":
      // physical-device testing: the connecting IP is a different machine
      // (the phone) by design, not a mismatch — just report it
      return `metro: ${metroTarget.host}  device: ${remoteAddress}`;
    case "unexpected-local":
      return `metro: ${metroTarget.host} (unexpected device: ${remoteAddress})`;
    default:
      return `metro: ${metroTarget.host}`;
  }
}
