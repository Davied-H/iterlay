export const ASSISTANT_PANEL_SIZE_STORAGE_KEY = "iterlay.assistantPanelSize";

export interface AssistantPanelSize {
  width: number;
  height: number;
}

function isAssistantPanelSize(value: unknown): value is AssistantPanelSize {
  if (!value || typeof value !== "object") return false;
  const size = value as Partial<AssistantPanelSize>;
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    (size.width as number) > 0 &&
    (size.height as number) > 0
  );
}

export function readAssistantPanelSize(
  storage?: Pick<Storage, "getItem">
): AssistantPanelSize | null {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return null;
    const raw = target.getItem(ASSISTANT_PANEL_SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAssistantPanelSize(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAssistantPanelSize(
  size: AssistantPanelSize,
  storage?: Pick<Storage, "setItem">
): void {
  if (!isAssistantPanelSize(size)) return;
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    target?.setItem(ASSISTANT_PANEL_SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // 本地存储不可用时，尺寸仍会保留到当前应用会话结束。
  }
}
