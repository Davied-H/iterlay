import { useEffect, useRef } from "react";

type BranchSetup = (restoreBoardConversation: boolean) => void | (() => void);

/**
 * History restoration lives as long as its board/surface/template branch.
 * Composer edits and provider-readiness renders update actions without cancelling it.
 */
export function useAssistantBranchLifecycle(
  signature: string,
  boardId: string,
  setup: BranchSetup
): void {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const intentRef = useRef<{ signature: string; boardId: string; restore: boolean } | null>(null);

  useEffect(() => {
    const previous = intentRef.current;
    // StrictMode replays setup after cleanup. Replay the same restoration intent,
    // rather than mistaking the replay for a context change on the same board.
    const restore = previous?.signature === signature && previous.boardId === boardId
      ? previous.restore
      : previous?.boardId !== boardId;
    intentRef.current = { signature, boardId, restore };
    return setupRef.current(restore);
  }, [signature, boardId]);
}
