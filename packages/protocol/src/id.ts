/**
 * Avoids crypto.randomUUID(): not guaranteed present in Hermes/RN without a polyfill,
 * and this only needs to be unique within one session's event stream, not globally.
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
