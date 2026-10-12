export const MAX_BOARD_SHORTCUTS = 9;

interface BoardShortcutInput {
  key: string;
  code: string;
  commandKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function isShortcutHelpCommand(input: BoardShortcutInput): boolean {
  if (!input.commandKey || input.altKey || input.shiftKey || input.repeat) return false;
  return input.code === "Slash" || input.key === "/";
}

/** Returns the zero-based board slot selected by Command/Ctrl + 1-9. */
export function resolveBoardShortcutIndex(input: BoardShortcutInput): number | null {
  if (!input.commandKey || input.altKey || input.shiftKey || input.repeat) return null;

  const codeMatch = /^(?:Digit|Numpad)([1-9])$/u.exec(input.code);
  const digit = codeMatch?.[1] ?? (/^[1-9]$/u.test(input.key) ? input.key : undefined);
  return digit ? Number(digit) - 1 : null;
}
