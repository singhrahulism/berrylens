export type Category =
  | "network"
  | "console"
  | "error"
  | "state"
  | "query"
  | "navigation"
  | "storage"
  | "native";

export interface InspectorEvent {
  id: string;
  /** ms epoch at capture time */
  timestamp: number;
  category: Category;
  /** short summary, e.g. "GET /users 200 · 240ms" */
  label: string;
  /** full structured payload */
  data: Record<string, unknown>;
  durationMs?: number;
}

export interface HelloMessage {
  type: "hello";
  appName: string;
  platform: string;
}

export interface EventMessage {
  type: "event";
  event: InspectorEvent;
}

export type ClientMessage = HelloMessage | EventMessage;

export { generateId } from "./id";
