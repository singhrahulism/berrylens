import type { AppState } from "./appState";
import { selectedDetailEvent } from "./appState";
import { dumpEventToFile, openInEditor, dumpTextToFile } from "./utils/dump";
import { copyToClipboard } from "./utils/clipboard";
import { buildCurlCommand, type NetworkEventDataForCurl } from "./views/curl";

/** `d` in detail mode: dump the selected event to a file and open it in `$EDITOR`. */
export function performDetailDump(state: AppState, setRawMode: ((value: boolean) => void) | undefined): void {
  const selected = selectedDetailEvent(state);
  if (!selected) return;
  const filePath = dumpEventToFile(selected);
  setRawMode?.(false);
  openInEditor(filePath);
  setRawMode?.(true);
}

/** `y` in a network detail view: build+save+copy a curl command. Returns the
 * status-bar confirmation message, or null if the selected event isn't network. */
export function performDetailCurlExport(state: AppState): string | null {
  const selected = selectedDetailEvent(state);
  if (selected?.category !== "network") return null;
  const curlCommand = buildCurlCommand(selected.data as NetworkEventDataForCurl);
  const filePath = dumpTextToFile(`curl-${selected.id}.sh`, curlCommand);
  const copied = copyToClipboard(curlCommand);
  return copied ? `curl copied to clipboard (also saved: ${filePath})` : `curl saved to ${filePath}`;
}
