import { spawnSync } from "node:child_process";

/** Best-effort system clipboard copy — never throws, just reports whether it worked. */
export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === "darwin") {
      return spawnSync("pbcopy", [], { input: text }).status === 0;
    }
    if (process.platform === "win32") {
      return spawnSync("clip", [], { input: text }).status === 0;
    }
    if (process.platform === "linux") {
      if (spawnSync("xclip", ["-selection", "clipboard"], { input: text }).status === 0) return true;
      return spawnSync("xsel", ["--clipboard", "--input"], { input: text }).status === 0;
    }
  } catch {
    // no clipboard tool available — fall through
  }
  return false;
}
