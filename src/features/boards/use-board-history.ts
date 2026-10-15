import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { GenerationJob, VideoGenerationJob } from "@shared/types";
import type { ImageWorkbenchApi } from "@shared/workbench-client";
interface HistoryOptions {
  boardId?: string;
  activeBoard: RefObject<{ id: string } | null>;
  libraryOpen: boolean;
  galleryOpen: boolean;
  getApi: () => ImageWorkbenchApi | null;
  onVideos: (jobs: VideoGenerationJob[]) => void;
  onError: (error: unknown) => void;
}
function mergeJobs(first: GenerationJob[], second: GenerationJob[]): GenerationJob[] {
  const jobs = new Map(second.map((job) => [job.id, job]));
  first.forEach((job) => jobs.set(job.id, job));
  return [...jobs.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
/** Query each surface at the scope it needs: rail pages, full gallery, scene history. */
export function useBoardHistory(options: HistoryOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [history, setHistory] = useState<GenerationJob[]>([]);
  const [sceneHistory, setSceneHistory] = useState<GenerationJob[]>([]);
  const [galleryHistory, setGalleryHistory] = useState<GenerationJob[]>([]);
  const [historyTotal, setTotal] = useState(0);
  const [historyHasMore, setHasMore] = useState(false);
  const [historyLoading, setLoading] = useState(false);
  const records = useRef<GenerationJob[]>([]);
  const cursor = useRef<{ boardId?: string; next?: string; expanded?: boolean }>({});
  const version = useRef(0);
  const refreshing = useRef<{ boardId: string; promise: Promise<void> } | null>(null);
  const loadingMore = useRef(false);
  const scenesVersion = useRef(0);
  const galleryVersion = useRef(0);

  const clearLoadedHistory = useCallback(() => {
    version.current++;
    records.current = [];
    cursor.current = {};
    setHistory([]);
    setHasMore(false);
    setTotal(0);
    setLoading(false);
  }, []);
  const loadScenes = useCallback(async () => {
    const o = latest.current;
    if (!o.libraryOpen) return;
    const api = o.getApi();
    if (!api) return;
    const request = ++scenesVersion.current;
    try {
      const jobs = await api.listSceneHistory();
      if (request === scenesVersion.current && latest.current.libraryOpen) setSceneHistory(jobs);
    } catch (error) { if (request === scenesVersion.current) o.onError(error); }
  }, []);
  const loadGallery = useCallback(async () => {
    const o = latest.current, id = o.activeBoard.current?.id;
    if (!id || !o.galleryOpen) return;
    const api = o.getApi();
    if (!api) return;
    const request = ++galleryVersion.current;
    try {
      const jobs = await api.listHistory(id);
      if (request === galleryVersion.current && latest.current.galleryOpen && latest.current.activeBoard.current?.id === id) setGalleryHistory(jobs);
    } catch (error) { if (request === galleryVersion.current) o.onError(error); }
  }, []);
  const refreshHistory = useCallback(async (): Promise<void> => {
    const o = latest.current, id = o.activeBoard.current?.id;
    if (!id) { clearLoadedHistory(); return; }
    if (refreshing.current?.boardId === id) return refreshing.current.promise;
    const api = o.getApi();
    if (!api) return;
    if (cursor.current.boardId !== id) {
      records.current = [];
      cursor.current = { boardId: id };
      setHistory([]); setHasMore(false); setTotal(0); setGalleryHistory([]);
    }
    const request = ++version.current;
    const promise = (async () => {
      setLoading(true);
      try {
        const [page, videos] = await Promise.all([api.listHistoryPage(id, undefined, 100), api.listVideoJobs(id)]);
        if (request !== version.current || latest.current.activeBoard.current?.id !== id) return;
        const preserve = cursor.current.expanded && page.total > 0;
        const next = preserve ? mergeJobs(page.items, records.current) : page.items;
        records.current = next;
        setHistory(next);
        setTotal(page.total);
        if (!preserve) cursor.current = { boardId: id, next: page.nextCursor };
        setHasMore(next.length < page.total && Boolean(cursor.current.next));
        o.onVideos(videos);
        await Promise.all([loadScenes(), loadGallery()]);
      } catch (error) { if (request === version.current) o.onError(error); }
      finally { if (request === version.current) setLoading(false); }
    })();
    refreshing.current = { boardId: id, promise };
    try { await promise; }
    finally { if (refreshing.current?.promise === promise) refreshing.current = null; }
  }, [clearLoadedHistory, loadGallery, loadScenes]);
  const loadMoreHistory = useCallback(async (): Promise<void> => {
    const o = latest.current, id = o.activeBoard.current?.id;
    const next = cursor.current;
    if (!id || next.boardId !== id || !next.next || loadingMore.current || refreshing.current) return;
    const api = o.getApi();
    if (!api) return;
    const request = ++version.current;
    loadingMore.current = true; setLoading(true);
    try {
      const page = await api.listHistoryPage(id, next.next, 100);
      if (request !== version.current || latest.current.activeBoard.current?.id !== id) return;
      records.current = mergeJobs(records.current, page.items);
      setHistory(records.current);
      setTotal(page.total);
      cursor.current = { boardId: id, next: page.nextCursor, expanded: true };
      setHasMore(Boolean(page.nextCursor));
    } catch (error) { if (request === version.current) o.onError(error); }
    finally { loadingMore.current = false; if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => { void refreshHistory(); }, [options.boardId, refreshHistory]);
  useEffect(() => { void loadScenes(); }, [options.libraryOpen, loadScenes]);
  useEffect(() => {
    if (options.galleryOpen) void loadGallery();
    else { galleryVersion.current++; setGalleryHistory([]); }
  }, [options.galleryOpen, options.boardId, loadGallery]);
  useEffect(() => () => { version.current++; scenesVersion.current++; galleryVersion.current++; }, []);
  return { history, sceneHistory, galleryHistory, historyTotal, historyHasMore, historyLoading, refreshHistory, loadMoreHistory, clearLoadedHistory };
}
