export type CanvasShortcutAction =
  | "select-all"
  | "undo"
  | "redo"
  | "duplicate"
  | "copy-original"
  | "edit"
  | "reference"
  | "slice"
  | "view-details"
  | "save-as-template"
  | "export-wechat"
  | "quick-share"
  | "download-original"
  | "remove-background"
  | "previous-version"
  | "next-version"
  | "focus-prompt"
  | "fit-canvas"
  | "fit-selection"
  | "show-shortcuts";

export interface CanvasShortcutInput {
  key: string;
  commandKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Maps a keyboard event to a canvas command without applying selection/state rules. */
export function resolveCanvasShortcut(input: CanvasShortcutInput): CanvasShortcutAction | null {
  const key = input.key.toLowerCase();

  if (input.commandKey && !input.altKey) {
    if (!input.shiftKey && key === "/") return "show-shortcuts";
    if (!input.shiftKey && key === "a") return "select-all";
    if (key === "z") return input.shiftKey ? "redo" : "undo";
    if (!input.shiftKey && key === "y") return "redo";
    if (!input.shiftKey && key === "d") return "duplicate";
    if (input.shiftKey && key === "c") return "copy-original";
    return null;
  }

  if (input.commandKey || input.altKey) return null;
  if (input.shiftKey && key === "1") return "fit-canvas";
  if (input.shiftKey && key === "2") return "fit-selection";
  if (input.key === "?") return "show-shortcuts";
  if (input.shiftKey) return null;

  if (key === "e") return "edit";
  if (key === "r") return "reference";
  if (key === "s") return "slice";
  if (key === "i") return "view-details";
  if (key === "t") return "save-as-template";
  if (key === "w") return "export-wechat";
  if (key === "h") return "quick-share";
  if (key === "d") return "download-original";
  if (key === "b") return "remove-background";
  if (key === "/") return "focus-prompt";
  if (key === "[") return "previous-version";
  if (key === "]") return "next-version";
  return null;
}
