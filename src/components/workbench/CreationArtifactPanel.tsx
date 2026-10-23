import { useEffect, useState, type ReactNode } from "react";
import { Check, Download, ExternalLink, GalleryHorizontal, Image as ImageIcon, Film, Pencil, X } from "lucide-react";
import type { CreationArtifact } from "@shared/creation-session";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import { artifactUrl } from "@/lib/creation-workspace";
import { useUiText } from "@/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import "./creation-workspace.css";

export interface CreationArtifactRendererProps {
  artifact: CreationArtifact;
  url?: string;
}
type Renderer = (props: CreationArtifactRendererProps) => ReactNode;
const renderers = new Map<string, Renderer>();

/** Extension views register by artifact kind and are removed when their owner unloads. */
export function registerCreationArtifactRenderer(kind: string, renderer: Renderer): () => void {
  if (renderers.has(kind)) throw new Error(`创作产物视图已注册：${kind}`);
  renderers.set(kind, renderer);
  return () => { if (renderers.get(kind) === renderer) renderers.delete(kind); };
}

function ArtifactMedia({ artifact, url }: CreationArtifactRendererProps): React.ReactElement {
  const uiText = useUiText();
  if (artifact.kind === "comic-drama" || artifact.mediaType === "project") return <div className="creation-artifact-unavailable"><Film size={25} />
    <strong>{artifact.boardName}</strong><span>{uiText("项目已创建，可在画板中继续编排。")}</span></div>;
  if (url && (artifact.kind === "video" || artifact.mediaType === "video")) return <video controls preload="metadata" src={url} aria-label={uiText("生成的视频")} />;
  if (url && (artifact.kind === "image" || artifact.mediaType === "image")) return <img src={url} alt={artifact.boardName} loading="lazy" />;
  return <div className="creation-artifact-unavailable">{artifact.kind === "video" ? <Film size={20} /> : <ImageIcon size={20} />}
    <span>{uiText(artifact.status === "pending" ? "任务仍在处理中，可打开画板查看进度。" : "素材暂时不可用，请打开画板查看。")}</span></div>;
}

export function CreationArtifactPanel({ artifacts, onUpdate, onClose, onOpenBoard, onRefine }: {
  artifacts: CreationArtifact[];
  onUpdate: (artifact: CreationArtifact, siblings?: CreationArtifact[]) => void;
  onClose: () => void;
  onOpenBoard: (boardId: string) => void;
  onRefine: (artifact: CreationArtifact) => void;
}): React.ReactElement {
  const uiText = useUiText();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pluginLabels, setPluginLabels] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState(artifacts.at(-1)?.id);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const active = artifacts.find((item) => item.id === activeId) ?? artifacts.at(-1);
  useEffect(() => {
    if (!hasImageWorkbenchApi()) return;
    const api = getImageWorkbenchApi();
    if (typeof api.listPlugins !== "function") return;
    let alive = true;
    void api.listPlugins().then((plugins) => {
      if (!alive) return;
      setPluginLabels(Object.fromEntries(plugins.filter((plugin) => plugin.enabled)
        .flatMap((plugin) => (plugin.manifest.creationArtifacts ?? []).map((item) => [item.kind, item.label]))));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!hasImageWorkbenchApi()) return;
    let alive = true;
    const refresh = async (): Promise<void> => {
      const api = getImageWorkbenchApi();
      const boards = new Map(await Promise.all([...new Set(artifacts.map((item) => item.boardId))]
        .map(async (id) => [id, await api.getBoard(id)] as const)));
      const next: Record<string, string> = {};
      for (const artifact of artifacts) {
        let updated = artifact;
        if ((artifact.kind === "video" || artifact.mediaType === "video") && artifact.status === "pending" && artifact.jobId) {
          const job = await api.getVideoJob(artifact.jobId).catch(() => null);
          if (job?.status === "completed" && job.outputVideoPath) updated = { ...artifact, status: "ready", path: job.outputVideoPath };
          if (job?.status === "failed" || job?.status === "cancelled") updated = { ...artifact, status: "failed" };
          if (updated !== artifact && alive) onUpdate(updated);
        }
        if ((artifact.kind === "image" || artifact.mediaType === "image") && artifact.status === "pending" && artifact.jobId) {
          const job = (await api.listHistory(artifact.boardId).catch(() => [])).find((item) => item.id === artifact.jobId || item.input.clientTaskId === artifact.jobId);
          if (job?.status === "succeeded" && job.outputImagePaths.length) {
            const paths = job.outputImagePaths;
            updated = { ...artifact, jobId: job.id, path: paths[0], status: "ready" };
            const siblings = paths.slice(1).map((path, index): CreationArtifact => ({ ...updated,
              id: `${artifact.jobId}:${index + 1}`, path }));
            if (alive) onUpdate(updated, siblings);
          } else if (job?.status === "failed" || job?.status === "cancelled") {
            updated = { ...artifact, status: "failed" };
            if (alive) onUpdate(updated);
          }
        }
        const board = boards.get(artifact.boardId);
        const url = board && artifactUrl(board, updated);
        if (url) next[artifact.id] = url;
      }
      if (alive) setUrls(next);
    };
    void refresh().catch(() => undefined);
    const timer = artifacts.some((item) => item.status === "pending") ? window.setInterval(() => void refresh().catch(() => undefined), 4_000) : null;
    return () => { alive = false; if (timer) window.clearInterval(timer); };
  }, [artifacts, onUpdate]);
  if (!active) return <></>;
  const RendererView = renderers.get(active.kind) ?? ArtifactMedia;
  const statusLabel = uiText(active.status === "ready" ? "已保存" : active.status === "pending" ? "处理中" : "不可用");
  return <aside className="creation-artifact-panel" aria-label={uiText("创作成果")}>
    <header className="creation-artifact-header">
      <div className="creation-artifact-heading">
        <h2 title={active.boardName}>{active.boardName}</h2>
        <span className="creation-artifact-status" role="status" aria-label={statusLabel} title={statusLabel}>
          {active.status === "ready" ? <Check size={13} aria-hidden="true" /> : statusLabel}
        </span>
      </div>
      <div className="creation-artifact-toolbar" role="toolbar" aria-label={uiText("创作成果")}>
        {artifacts.length > 1 ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="create-chat-icon-button" type="button" aria-label={uiText("选择创作成果")} title={uiText("选择创作成果")}><GalleryHorizontal size={17} /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="creation-artifact-menu">
            <DropdownMenuRadioGroup value={active.id} onValueChange={setActiveId}>
              {artifacts.map((artifact, index) => <DropdownMenuRadioItem key={artifact.id} value={artifact.id}>
                {artifact.mediaType === "video" || artifact.kind === "video" ? <Film size={15} /> : <ImageIcon size={15} />}
                <span>{pluginLabels[artifact.kind] ?? (artifact.kind === "video" ? uiText("视频") : artifact.kind === "image" ? uiText("图片") : uiText("创作项目"))} {index + 1}</span>
              </DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu> : null}
        <button className="create-chat-icon-button" type="button" aria-label={uiText("继续修改")} title={uiText("继续修改")} onClick={() => onRefine(active)}><Pencil size={17} /></button>
        <button className="create-chat-icon-button" type="button" aria-label={uiText("在画板中打开")} title={uiText("在画板中打开")} onClick={() => onOpenBoard(active.boardId)}><ExternalLink size={17} /></button>
        <button className="create-chat-icon-button" type="button" aria-label={uiText("导出成果")} title={uiText("导出成果")} disabled={!active.path || active.status !== "ready"} onClick={() => { if (active.path && active.status === "ready") void getImageWorkbenchApi().saveAsset(active.path); }}><Download size={17} /></button>
        <button className="create-chat-icon-button" type="button" aria-label={uiText("收起成果预览")} title={uiText("收起成果预览")} onClick={onClose}><X size={17} /></button>
      </div>
    </header>
    <div className="creation-artifact-view"><RendererView artifact={active} url={urls[active.id]} /></div>
  </aside>;
}
