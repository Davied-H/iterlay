export interface AssistantShortcutInput {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

export interface AssistantShortcutDescriptor {
  label: string;
  ariaKeyShortcuts: string;
}

function currentPlatform(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform;
}

export function isMacLikePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/u.test(platform);
}

export function getAssistantShortcutDescriptor(
  platform = currentPlatform()
): AssistantShortcutDescriptor {
  return isMacLikePlatform(platform)
    ? { label: "⌘ J", ariaKeyShortcuts: "Meta+J" }
    : { label: "Ctrl J", ariaKeyShortcuts: "Control+J" };
}

export function matchesAssistantShortcut(
  input: AssistantShortcutInput,
  platform = currentPlatform()
): boolean {
  const commandKey = isMacLikePlatform(platform) ? input.metaKey : input.ctrlKey;
  const isJKey = input.code === "KeyJ" || input.key.toLowerCase() === "j";
  return commandKey && isJKey && !input.altKey && !input.shiftKey && !input.repeat;
}
