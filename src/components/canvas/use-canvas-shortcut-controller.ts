import { useEffect, useRef } from "react";
import {
  planCanvasShortcut,
  type CanvasShortcutCommand,
  type CanvasShortcutSnapshot
} from "./canvas-shortcut-plan";

export interface CanvasCommandApi {
  execute: (
    command: CanvasShortcutCommand,
    snapshot: CanvasShortcutSnapshot
  ) => void | Promise<void>;
  reject: (message: string) => void;
}

interface CanvasShortcutControllerOptions {
  getSnapshot: () => CanvasShortcutSnapshot;
  commandApi: CanvasCommandApi;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element
    && (
      element.tagName === "INPUT"
      || element.tagName === "TEXTAREA"
      || element.tagName === "SELECT"
      || element.isContentEditable
    )
  );
}

/** Owns only the global keyboard listener; command execution stays behind CanvasCommandApi. */
export function useCanvasShortcutController({
  getSnapshot,
  commandApi
}: CanvasShortcutControllerOptions): void {
  const getSnapshotRef = useRef(getSnapshot);
  const commandApiRef = useRef(commandApi);
  getSnapshotRef.current = getSnapshot;
  commandApiRef.current = commandApi;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const snapshot = getSnapshotRef.current();
      const plan = planCanvasShortcut({
        key: event.key,
        commandKey: event.metaKey || event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        repeat: event.repeat,
        editableTarget: isEditableTarget(event.target)
      }, snapshot);

      if (plan.type === "ignore" || plan.type === "defer") return;
      if (plan.preventDefault) event.preventDefault();
      if (plan.type === "reject") {
        commandApiRef.current.reject(plan.message);
        return;
      }
      void commandApiRef.current.execute(plan.command, snapshot);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
