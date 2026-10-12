export type CanvasToolMode = "select" | "pan";

export function canvasToolShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "repeat">): CanvasToolMode | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.repeat) return null;
  if (event.key.toLowerCase() === "v") return "select";
  if (event.key.toLowerCase() === "h") return "pan";
  return null;
}
