import { useSyncExternalStore } from "react";

export const ASSISTANT_WIDTHS = { small: 460, medium: 560, large: 660, maximum: 760 } as const;
export type AssistantWidth = keyof typeof ASSISTANT_WIDTHS;
export const ASSISTANT_WIDTH_KEY = "iterlay.assistantWidth.v1";
const changeEvent = "iterlay:assistant-width";
let sessionWidth: AssistantWidth = "medium";

export function readAssistantWidth(): AssistantWidth {
  try {
    const value = localStorage.getItem(ASSISTANT_WIDTH_KEY);
    return value && Object.hasOwn(ASSISTANT_WIDTHS, value) ? value as AssistantWidth : "medium";
  } catch {
    return sessionWidth;
  }
}

export function setAssistantWidth(value: AssistantWidth): void {
  sessionWidth = value;
  try {
    localStorage.setItem(ASSISTANT_WIDTH_KEY, value);
  } catch {
    // Keep the preference usable for this session if storage is unavailable.
  }
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === ASSISTANT_WIDTH_KEY || event.key === null) onChange();
  };
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAssistantWidth(): AssistantWidth {
  return useSyncExternalStore(subscribe, readAssistantWidth, () => "medium");
}
