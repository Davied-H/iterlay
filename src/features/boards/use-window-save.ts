import { useEffect, useRef } from "react";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";

/** Main owns close/quit; renderer acknowledges only after persistence finishes. */
export function useWindowSave(flush: () => Promise<void>): void {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    if (!hasImageWorkbenchApi()) return;
    const api = getImageWorkbenchApi();
    const unsubscribe = api.onWindowSaveRequest(async ({ requestId }) => {
      try {
        await latest.current();
        api.completeWindowSave({ requestId, ok: true });
      } catch (error) {
        api.completeWindowSave({ requestId, ok: false, error: error instanceof Error ? error.message : "画板保存失败。" });
      }
    });
    api.windowRendererReady();
    if (!import.meta.env.DEV || !document.documentElement.dataset.workbenchConnection) return unsubscribe;
    const flushInBackground = (): void => { void latest.current().catch(() => undefined); };
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      const state = document.documentElement.dataset.boardSaveState;
      if (!state || state === "saved") return;
      flushInBackground();
      event.preventDefault();
      event.returnValue = "";
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") flushInBackground();
    };
    const onBeforeBackendReload = (event: Event): void => {
      (event as CustomEvent<{ waitUntil(task: Promise<void>): void }>).detail.waitUntil(latest.current());
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("iterlay:browser-workbench-before-reload", onBeforeBackendReload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("iterlay:browser-workbench-before-reload", onBeforeBackendReload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
