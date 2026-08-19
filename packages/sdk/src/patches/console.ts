import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";

const LEVELS = ["log", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

/**
 * All levels land in category "console" (with `data.level` set) rather than
 * splitting console.error into category "error" — that category is reserved
 * for uncaught exceptions/rejections (see errors.ts). The pane groups both
 * together anyway, and the level field is what colors error lines within it.
 */
export const consoleCapture: Capture = {
  name: "console",
  install(emit: Emit) {
    const originals: Partial<Record<Level, (...args: unknown[]) => void>> = {};

    for (const level of LEVELS) {
      const original = console[level];
      if (!original) continue;
      // keep the unbound reference for a clean restore on uninstall; call
      // through a bound copy so `this` is correct regardless of call site
      originals[level] = original;
      const callOriginal = original.bind(console);

      console[level] = (...args: unknown[]) => {
        callOriginal(...args);
        safeEmit(emit, {
          id: generateId(),
          timestamp: Date.now(),
          category: "console",
          label: formatLabel(args),
          data: { level, args: describeArgs(args) },
        });
      };
    }

    return () => {
      for (const level of LEVELS) {
        const original = originals[level];
        if (original) console[level] = original;
      }
    };
  },
};

function formatLabel(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === "string" ? arg : safeStringify(arg)))
    .join(" ")
    .slice(0, 200);
}

function describeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => (arg instanceof Error ? { message: arg.message, stack: arg.stack } : arg));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
