import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";

interface RNErrorUtils {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
}

/**
 * Global uncaught errors (RN's ErrorUtils) and unhandled promise rejections.
 * Both are best-effort: ErrorUtils only exists on RN, and unhandledrejection
 * as a global event isn't universally available (e.g. plain Node) — each
 * check no-ops rather than throwing when its target API isn't present.
 */
export const errorsCapture: Capture = {
  name: "errors",
  install(emit: Emit) {
    const disposers = [patchGlobalErrorHandler(emit), patchUnhandledRejection(emit)];
    return () => disposers.forEach((dispose) => dispose());
  },
};

function patchGlobalErrorHandler(emit: Emit): () => void {
  const errorUtils = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (!errorUtils || typeof errorUtils.setGlobalHandler !== "function") return () => {};

  const original = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    safeEmit(emit, {
      id: generateId(),
      timestamp: Date.now(),
      category: "error",
      label: `${isFatal ? "Fatal: " : ""}${error.message}`,
      data: { message: error.message, stack: error.stack, isFatal: Boolean(isFatal) },
    });
    original(error, isFatal);
  });

  return () => errorUtils.setGlobalHandler(original);
}

function patchUnhandledRejection(emit: Emit): () => void {
  const g = globalThis as typeof globalThis & {
    addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
    removeEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
  };
  if (typeof g.addEventListener !== "function") return () => {};

  const handler = (event: { reason?: unknown }) => {
    const reason = event?.reason;
    safeEmit(emit, {
      id: generateId(),
      timestamp: Date.now(),
      category: "error",
      label: `Unhandled rejection: ${describeReason(reason)}`,
      data: { reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason },
    });
  };

  g.addEventListener("unhandledrejection", handler);
  return () => g.removeEventListener?.("unhandledrejection", handler);
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}
