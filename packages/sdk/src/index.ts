import { Transport } from "./transport";
import type { Capture, Emit } from "./capture";
import { networkCapture } from "./patches/network";
import { consoleCapture } from "./patches/console";
import { errorsCapture } from "./patches/errors";
import { storageCapture } from "./patches/storage";
import { reduxAdapter, type ReduxStoreLike } from "./adapters/redux";
import { reactQueryAdapter, type QueryClientLike } from "./adapters/reactQuery";
import { navigationAdapter, type NavigationContainerRefLike } from "./adapters/navigation";

export interface AttachInspectorOptions {
  /** Dev-machine host running the berrylens CLI. Defaults to the Metro packager host. */
  host?: string;
  port?: number;
  appName?: string;
  /** One-line attach for a Redux store instance — no `applyMiddleware` setup needed. */
  reduxStore?: ReduxStoreLike;
  /** One-line attach for an existing React Query `QueryClient` instance. */
  queryClient?: QueryClientLike;
  /** One-line attach for a React Navigation `navigationRef`. */
  navigationRef?: NavigationContainerRefLike;
}

const DEFAULT_PORT = 7890;

export interface Inspector {
  /**
   * Installs an additional `Capture` (e.g. `inspectStore(store, name)` for a
   * Zustand store) onto the same transport this inspector already opened.
   * Returns an uninstall function for that one capture.
   */
  attach(capture: Capture): () => void;
  /** Tears down every capture installed so far and closes the transport. */
  detach(): void;
}

/**
 * Call once at app entry. Applies zero-config patches unconditionally (network,
 * console, errors, storage) and installs whichever adapters were passed in.
 * Library instances that can't be passed as options up front — most notably
 * Zustand, which has no central store registry to discover from — attach via
 * the returned `inspector.attach(inspectStore(store, name))`.
 */
export function attachInspector(options: AttachInspectorOptions = {}): Inspector {
  const host = options.host ?? resolveDefaultHost();
  const port = options.port ?? DEFAULT_PORT;
  const appName = options.appName ?? "ReactNativeApp";
  const platform = resolvePlatform();

  const transport = new Transport({ host, port, appName, platform });
  const emit: Emit = (event) => transport.emit(event);

  const captures: Capture[] = [networkCapture, consoleCapture, errorsCapture, storageCapture];
  if (options.reduxStore) captures.push(reduxAdapter(options.reduxStore));
  if (options.queryClient) captures.push(reactQueryAdapter(options.queryClient));
  if (options.navigationRef) captures.push(navigationAdapter(options.navigationRef));

  const uninstalls = captures.map((capture) => safeInstall(capture, emit));

  function attach(capture: Capture): () => void {
    const uninstall = safeInstall(capture, emit);
    uninstalls.push(uninstall);
    return uninstall;
  }

  function detach(): void {
    uninstalls.forEach((uninstall) => uninstall());
    transport.close();
  }

  return { attach, detach };
}

function safeInstall(capture: Capture, emit: Emit): () => void {
  try {
    return capture.install(emit);
  } catch {
    return () => {};
  }
}

function resolveDefaultHost(): string {
  try {
    const scriptURL = (
      globalThis as { NativeModules?: { SourceCode?: { scriptURL?: string } } }
    ).NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = /^https?:\/\/([^:/]+)/.exec(scriptURL);
      if (match) return match[1];
    }
  } catch {
    // fall through to the warning + default below
  }
  // Falling back here means auto-detection failed — on a physical device
  // "localhost" resolves to the device itself, not the dev machine, so this
  // is worth surfacing rather than silently trying (and endlessly retrying)
  // a connection that can never succeed.
  // eslint-disable-next-line no-console
  console.warn(
    '[berrylens] could not auto-detect the dev-machine host (NativeModules.SourceCode.scriptURL unavailable) ' +
      '— falling back to "localhost", which only works if this device *is* the dev machine (e.g. an iOS ' +
      'Simulator). On a physical device, pass it explicitly: attachInspector({ host: "<your Mac\'s LAN IP>" }).',
  );
  return "localhost";
}

function resolvePlatform(): string {
  try {
    return (globalThis as { Platform?: { OS?: string } }).Platform?.OS ?? "unknown";
  } catch {
    return "unknown";
  }
}

export type { InspectorEvent, Category } from "@berrylens/protocol";
export type { Capture, Emit } from "./capture";

// All four are usable directly via `inspector.attach(...)`, not just as
// attachInspector() options — needed whenever the instance isn't available
// yet at the point attachInspector() is called. Zustand always needs this
// (no central store registry); navigationRef commonly does too under
// expo-router, where it's only obtainable via a hook inside a mounted
// component, after attachInspector() has already run at module scope.
export { inspectStore } from "./adapters/zustand";
export type { ZustandStoreLike } from "./adapters/zustand";
export { reduxAdapter } from "./adapters/redux";
export type { ReduxStoreLike, ReduxAction } from "./adapters/redux";
export { reactQueryAdapter } from "./adapters/reactQuery";
export type { QueryClientLike } from "./adapters/reactQuery";
export { navigationAdapter } from "./adapters/navigation";
export type { NavigationContainerRefLike } from "./adapters/navigation";
