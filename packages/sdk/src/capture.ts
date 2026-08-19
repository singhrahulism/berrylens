import type { InspectorEvent } from "@berrylens/protocol";

export type Emit = (event: InspectorEvent) => void;

/**
 * Every patch and adapter implements this. Self-contained and independently
 * testable with a fake `emit` — this is also the shape a future public plugin
 * API would take, so extracting one later is exporting the interface, not a rewrite.
 */
export interface Capture {
  name: string;
  /** Returns an uninstall function. Must never throw into the host app. */
  install(emit: Emit): () => void;
}

export function safeEmit(emit: Emit, event: InspectorEvent): void {
  try {
    emit(event);
  } catch {
    // a capture must never throw into the host app
  }
}
