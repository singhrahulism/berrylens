import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { InspectorEvent } from "@berrylens/protocol";

export function dumpEventToFile(event: InspectorEvent): string {
  const dir = mkdtempSync(join(tmpdir(), "berrylens-"));
  const file = join(dir, `${event.category}-${event.id}.json`);
  writeFileSync(file, JSON.stringify(event, null, 2), "utf8");
  return file;
}

export function dumpTextToFile(filename: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "berrylens-"));
  const file = join(dir, filename);
  writeFileSync(file, content, "utf8");
  return file;
}

/** Returns false (and does nothing) if $EDITOR isn't set — caller falls back to just the file path. */
export function openInEditor(filePath: string): boolean {
  const editor = process.env.EDITOR;
  if (!editor) return false;
  try {
    spawnSync(editor, [filePath], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}
