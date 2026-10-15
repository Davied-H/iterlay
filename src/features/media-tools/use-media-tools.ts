import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaToolsState } from "@shared/media-tools";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi } from "@/lib/image-workbench-api";

export interface MediaToolsApi {
  getMediaToolsState: () => Promise<MediaToolsState>;
  installMediaTools: () => Promise<MediaToolsState>;
  cancelMediaToolsDownload: () => Promise<void>;
  onMediaToolsState: (listener: (state: MediaToolsState) => void) => () => void;
}

export function useMediaTools(providedApi?: MediaToolsApi) {
  const api = providedApi ?? (hasImageWorkbenchApi() ? getImageWorkbenchApi() : undefined);
  const [state, setState] = useState<MediaToolsState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const stateRef = useRef<MediaToolsState | null>(null);
  const pendingRef = useRef<{ promise: Promise<boolean>; resolve: (ready: boolean) => void } | null>(null);
  const mountedRef = useRef(false);
  const eventRevisionRef = useRef(0);
  const installAttemptRef = useRef(0);
  const startingRef = useRef(false);

  const finish = useCallback((ready: boolean): void => {
    pendingRef.current?.resolve(ready);
    pendingRef.current = null;
    if (mountedRef.current) setDialogOpen(false);
  }, []);

  const acceptState = useCallback((next: MediaToolsState): void => {
    if (!mountedRef.current) return;
    stateRef.current = next;
    setState(next);
    setError(next.error);
    if (next.status === "ready") finish(true);
  }, [finish]);

  const readState = useCallback(async (): Promise<MediaToolsState | null> => {
    if (!api) return null;
    const revision = eventRevisionRef.current;
    const next = await api.getMediaToolsState();
    // A progress event can arrive before the snapshot request completes.
    if (eventRevisionRef.current === revision) acceptState(next);
    return stateRef.current ?? next;
  }, [acceptState, api]);

  useEffect(() => {
    mountedRef.current = true;
    if (!api) return () => { mountedRef.current = false; };
    const unsubscribe = api.onMediaToolsState((next) => {
      eventRevisionRef.current += 1;
      acceptState(next);
    });
    // This only checks the local cache. Downloading requires confirmInstall below.
    void readState().catch(() => undefined);
    return () => {
      mountedRef.current = false;
      installAttemptRef.current += 1;
      unsubscribe();
      finish(false);
    };
  }, [acceptState, api, finish, readState]);

  const ensureMediaToolsReady = useCallback((): Promise<boolean> => {
    if (!api || !mountedRef.current) return Promise.resolve(false);
    if (pendingRef.current) return pendingRef.current.promise;
    let resolve!: (ready: boolean) => void;
    const promise = new Promise<boolean>((accept) => { resolve = accept; });
    const pending = { promise, resolve };
    pendingRef.current = pending;
    void readState().then((next) => {
      if (pendingRef.current !== pending || !mountedRef.current) return;
      if (next?.status === "ready") finish(true);
      else setDialogOpen(true);
    }).catch((requestError) => {
      if (pendingRef.current !== pending || !mountedRef.current) return;
      setError(getWorkbenchErrorMessage(requestError, "无法检查视频组件，请重试。"));
      setDialogOpen(true);
    });
    return promise;
  }, [api, finish, readState]);

  const confirmInstall = useCallback(async (): Promise<void> => {
    if (!api || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(undefined);
    const attempt = ++installAttemptRef.current;
    try {
      const next = await api.installMediaTools();
      if (!mountedRef.current || attempt !== installAttemptRef.current) return;
      acceptState(next);
      if (next.status === "missing") setError("下载已取消，可以重新下载。");
    } catch (requestError) {
      if (!mountedRef.current || attempt !== installAttemptRef.current) return;
      setError(getWorkbenchErrorMessage(requestError, "视频组件下载失败，请重试。"));
    } finally {
      if (attempt === installAttemptRef.current) {
        startingRef.current = false;
        if (mountedRef.current) setStarting(false);
      }
    }
  }, [acceptState, api]);

  const cancel = useCallback((): void => {
    installAttemptRef.current += 1;
    const busy = startingRef.current || ["downloading", "verifying"].includes(stateRef.current?.status ?? "");
    startingRef.current = false;
    setStarting(false);
    finish(false);
    if (api && busy) void api.cancelMediaToolsDownload().catch(() => undefined);
  }, [api, finish]);

  return { state, dialogOpen, starting, error, ensureMediaToolsReady, confirmInstall, cancel };
}
