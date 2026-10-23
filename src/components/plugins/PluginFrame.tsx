import { useUiText } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import type { BoardMutationPlan, BoardMutationResult } from "@shared/comic-drama";
import { SHORT_DRAMA_PLUGIN_ID, type PluginContext, type InstalledPlugin } from "@shared/plugins";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { startSceneCollaborationStream, type SceneCollaborationStreamHandle } from "@/lib/scene-collaboration-stream";

export interface PluginHostProps {
  context: PluginContext;
  beforeRequest: () => Promise<void>;
  onMutation: (result: BoardMutationResult) => Promise<void>;
  onApplyPlan: (plan: BoardMutationPlan) => Promise<void>;
  onSelect: (ids: string[]) => void;
  onBack?: () => void;
  onManage?: () => void;
}
const permissionByMethod: Record<string, string> = {
  "workspace.export": "board:read",
  "board.previews": "board:read", "board.snapshot": "board:read", "board.select": "board:read", "board.applyPlan": "board:write",
  "storage.get": "storage", "storage.set": "storage", "assistant.start": "assistant:comic-drama",
  "assistant.cancel": "assistant:comic-drama", "assistant.respond": "assistant:comic-drama",
  "creation.present": "creation:present"
};
export function validateAssistantFields(input: unknown): Array<{ label: string; value: string }> {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 32) throw new Error("助手上下文无效。");
  let size = 0;
  return input.map(field => {
    if (!field || typeof field !== "object" || typeof field.label !== "string" || typeof field.value !== "string"
      || field.label.length > 200 || (size += field.value.length) > 2_000_000) throw new Error("助手上下文无效。");
    return { label: field.label, value: field.value };
  });
}
export function PluginFrame({ plugin, view = "tool", ...props }: PluginHostProps & { plugin: InstalledPlugin; view?: "tool" | "settings" }) {
  const uiText = useUiText();
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ source: "iterlay-host", type: "context", context: current.current.context, view }, "*");
  }, [props.context.locale, props.context.theme, view]);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const stream = useRef<SceneCollaborationStreamHandle | null>(null);
  useEffect(() => {
    let disposed = false;
    setHtml(""); setError("");
    void getImageWorkbenchApi().getPluginFrameUrl(plugin.manifest.id).then(url => {
      if (!disposed) setHtml(url);
    }).catch(reason => { if (!disposed) setError(String(reason)); });
    return () => { disposed = true; stream.current?.dispose(); stream.current = null; };
  }, [plugin.manifest.id, plugin.manifest.version]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ source: "iterlay-host", type: "context", context: props.context, view }, "*");
  }, [props.context, view]);
  useEffect(() => {
    let live = true;
    let starting = false;
    const post = (message: Record<string, unknown>) => { if (live) frame.current?.contentWindow?.postMessage({ source: "iterlay-host", ...message }, "*"); };
    const refresh = () => post({ type: "board-changed" });
    async function invoke(method: string, params: Record<string, unknown>) {
      const api = getImageWorkbenchApi();
      const host = current.current;
      const permission = permissionByMethod[method];
      if (!["context.get", "workspace.back", "workspace.manage"].includes(method) && !permission) throw new Error("未知的插件方法。");
      await api.authorizePlugin(plugin.manifest.id, permission ?? "");
      if (!live) throw new Error("工具已关闭。");
      if (method === "workspace.export") { await host.beforeRequest(); return api.exportBoard(host.context.boardId); }
      if (method === "workspace.back") {
        await host.beforeRequest();
        host.onBack?.();
        return;
      }
      if (method === "workspace.manage") { host.onManage?.(); return; }
      if (method === "context.get") { post({ type: "view", view }); return host.context; }
      if (method === "creation.present") {
        const conversationId = params.conversationId;
        const kind = params.kind;
        const nodeId = params.nodeId;
        if (typeof conversationId !== "string" || typeof kind !== "string" || typeof nodeId !== "string"
          || conversationId.length > 128 || nodeId.length > 128) throw new Error("创作产物请求无效。");
        const declared = plugin.manifest.creationArtifacts?.find((item) => item.kind === kind);
        if (!declared) throw new Error("插件未声明此创作产物类型。");
        const board = await api.getBoard(host.context.boardId);
        const node = board?.nodes.find((item) => item.id === nodeId);
        if (!board || !node) throw new Error("创作产物不在当前画板中。");
        const sessions = await api.listCreationSessions();
        const session = sessions.find((item) => item.id === conversationId && (!item.boardId || item.boardId === board.id));
        if (!session) throw new Error("创作会话与当前画板不匹配。");
        const imagePath = "imagePath" in node && typeof node.imagePath === "string" ? node.imagePath : undefined;
        const videoPath = "videoPath" in node && typeof node.videoPath === "string" ? node.videoPath : undefined;
        const path = declared.mediaType === "image" ? imagePath : declared.mediaType === "video" ? videoPath : undefined;
        if (declared.mediaType !== "project" && !path) throw new Error("创作产物尚未完成。");
        const artifactId = `${plugin.manifest.id}:${nodeId}`;
        const artifact = { id: artifactId, kind, mediaType: declared.mediaType, pluginId: plugin.manifest.id,
          boardId: board.id, boardName: board.name, nodeId, path, prompt: typeof params.prompt === "string" ? params.prompt.slice(0, 12000) : "",
          status: "ready" as const, createdAt: new Date().toISOString() };
        const updated = await api.presentCreationArtifact(conversationId, artifact);
        window.dispatchEvent(new CustomEvent("iterlay:creation:updated", { detail: updated }));
        return { artifactId };
      }
      if (method === "storage.get" || method === "storage.set") {
        if (params.scope !== "settings" && params.scope !== "board") throw new Error("存储范围无效。");
        const scope = params.scope === "settings" ? "settings" : `board:${host.context.boardId}`;
        return method === "storage.get" ? api.readPluginState(plugin.manifest.id, scope) : api.writePluginState(plugin.manifest.id, scope, params.value);
      }
      if (method === "board.select") {
        if (!Array.isArray(params.nodeIds) || params.nodeIds.length > 1000 || params.nodeIds.some(id => typeof id !== "string")) throw new Error("节点选择无效。");
        host.onSelect(params.nodeIds); return;
      }
      if (method === "board.previews") {
        const board = await api.getBoard(host.context.boardId);
        if (!board) return {};
        const result: Record<string, string> = {};
        const sources = board.nodes.filter(n => n.type === "comic-character" || n.type === "comic-segment-script").slice(0, 32);
        for (const source of sources) {
          const reachable = new Set([source.id]);
          for (let depth = 0; depth < 3; depth++) {
            const frontier = new Set(reachable);
            for (const connection of board.connections ?? []) {
              const target = board.nodes.find(n => n.id === connection.target);
              if (connection.kind === "reference" && frontier.has(connection.source)
                && target && !["comic-setting", "comic-character", "comic-segment-script"].includes(target.type ?? "image")) {
                reachable.add(connection.target);
              }
            }
          }
          const image = board.nodes.find(n => reachable.has(n.id) && "imagePath" in n);
          if (!image || !("imagePath" in image) || typeof image.imagePath !== "string") continue;
          try {
            const dataUrl = await api.readAssetDataUrl(image.imagePath);
            const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
            try {
              const canvas = document.createElement("canvas");
              const ratio = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
              canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
              canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
              canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              result[source.id] = canvas.toDataURL("image/webp", 0.8);
            } finally { bitmap.close(); }
          } catch { /* Missing images keep their explicit empty preview. */ }
        }
        return result;
      }
      if (method === "board.snapshot") { await host.beforeRequest(); return api.getComicDramaBoardSnapshot(host.context.boardId); }
      if (method === "board.applyPlan") {
        if (stream.current || starting) throw new Error("请先停止助手，再编辑制作内容。");
        const plan = params as unknown as BoardMutationPlan;
        if (plan.boardId !== host.context.boardId) throw new Error("插件只能修改当前画板。");
        await host.beforeRequest();
        await host.onApplyPlan(plan); refresh(); return;
      }
      if (method === "assistant.cancel") { stream.current?.cancel(); return; }
      if (method === "assistant.respond") {
        if (typeof params.interactionId !== "string" || !["submit", "dismiss"].includes(String(params.action))) throw new Error("交互响应无效。");
        stream.current?.respondToInteraction(params.interactionId, params.action as "submit" | "dismiss", params.values as Record<string, string | string[]>); return;
      }
      if (method === "assistant.start") {
        if (stream.current || starting) throw new Error("助手正在执行任务。");
        if (typeof params.instruction !== "string" || !params.instruction.trim() || params.instruction.length > 30_000) throw new Error("请输入有效的创作指令。");
        const instruction = params.instruction;
        starting = true;
        try {
          await host.beforeRequest();
          const currentFields = params.currentFields === undefined && plugin.manifest.id === SHORT_DRAMA_PLUGIN_ID
            ? (await import("@/compat/plugins/legacy-assistant-context")).legacyAssistantFields(
                await api.getComicDramaBoardSnapshot(host.context.boardId), host.context.selectedNodeIds)
            : validateAssistantFields(params.currentFields);
          if (!live) return;
          const emit = (event: Record<string, unknown>) => post({ type: "assistant", event });
          const finish = (event: Record<string, unknown>) => { stream.current = null; emit(event); refresh(); };
          stream.current = startSceneCollaborationStream({
            instruction, locale: host.context.locale as "zh-CN" | "en-US", referenceImages: [],
            currentFields,
            conversation: Array.isArray(params.conversation) ? params.conversation.slice(-16) as Array<{ role: "user" | "assistant"; content: string }> : [],
            conversationId: typeof params.conversationId === "string" ? params.conversationId.slice(0, 100) : crypto.randomUUID(),
            recordInHistory: true, assistantSurface: "comic-drama", memoryQuery: { boardId: host.context.boardId }, workflowMode: "generate", agentMode: true
          }, {
            onDelta: delta => emit({ type: "delta", delta }),
            onActivity: label => emit({ type: "activity", label }),
            onInteraction: (id, interaction) => emit({ type: "interaction", id, interaction }),
            onComicMutation: result => { void host.onMutation(result).then(refresh).catch(reason => emit({ type: "warning", message: String(reason) })); },
            onResult: result => finish({ type: "result", result }),
            onError: message => finish({ type: "error", message }),
            onCancelled: () => finish({ type: "cancelled" })
          });
        } finally { starting = false; }
      }
    }
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== "iterlay-plugin" || typeof event.data.id !== "string" || typeof event.data.method !== "string") return;
      const { id, method, params } = event.data;
      void invoke(method, params && typeof params === "object" ? params : {}).then(result => post({ type: "response", id, result })).catch(reason => post({ type: "response", id, error: reason instanceof Error ? reason.message : String(reason) }));
    };
    window.addEventListener("message", listener);
    return () => { live = false; window.removeEventListener("message", listener); stream.current?.dispose(); stream.current = null; };
  }, [plugin.manifest.id, plugin.manifest.creationArtifacts, view]);
  if (error) return <div role="alert" className="plugin-message">{error}{props.onBack && <button onClick={props.onBack}>{uiText("返回主画板")}</button>}</div>;
  if (!html) return <div className="plugin-message">{uiText("正在加载工具…")}</div>;
  return <iframe ref={frame} title={`${plugin.manifest.id === SHORT_DRAMA_PLUGIN_ID ? uiText(plugin.manifest.name) : plugin.manifest.name} ${view === "settings" ? uiText("设置") : ""}`.trim()} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" src={html} className="plugin-frame" onLoad={() => frame.current?.contentWindow?.postMessage({ source: "iterlay-host", type: "context", context: current.current.context, view }, "*")} />;
}
