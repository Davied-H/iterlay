import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useUiText } from "@/i18n";
import { getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { isBoardImageNode, type BoardData } from "@shared/types";
import {
  imageNodeVersions, resolveDeliverySource, resolveImageVersion, validateImageDeliveryRecipe,
  type ImageDeliveryExportResult, type ImageDeliveryFormat, type ImageDeliveryItem, type ImageDeliveryRecipe, type ImageVersionIdentity
} from "@shared/image-delivery";
import "./image-delivery.css";

export interface ImageDeliveryApi {
  setFinalVersion: (input: { boardId: string; nodeId: string; version: ImageVersionIdentity | null }) => Promise<BoardData>;
  saveRecipe: (input: { boardId: string; recipe: ImageDeliveryRecipe }) => Promise<BoardData>;
  removeRecipe: (input: { boardId: string; recipeId: string }) => Promise<BoardData>;
  exportRecipe: (input: { boardId: string; recipeId: string }) => Promise<ImageDeliveryExportResult>;
}
export interface ImageDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: BoardData;
  onBoardChanged: (board: BoardData) => void;
  api: ImageDeliveryApi;
  /** FIELD 等已有实例只预填草稿；不会自动写入或覆盖后端。 */
  initialRecipe?: ImageDeliveryRecipe | null;
}
const sameVersion = (left: ImageVersionIdentity, right: ImageVersionIdentity): boolean => left.imagePath === right.imagePath && left.jobId === right.jobId;

export function ImageDeliveryDialog({ open, onOpenChange, board, onBoardChanged, api, initialRecipe }: ImageDeliveryDialogProps): React.ReactElement {
  const uiText = useUiText();
  const [current, setCurrent] = useState(board);
  const [draft, setDraft] = useState<ImageDeliveryRecipe | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const appliedInitialRecipeId = useRef<string | null>(null);
  useEffect(() => setCurrent(board), [board]);
  useEffect(() => { if (!open) { setDraft(null); setError(""); setNotice(""); appliedInitialRecipeId.current = null; } }, [open]);
  useEffect(() => {
    if (open && initialRecipe && appliedInitialRecipeId.current !== initialRecipe.id) {
      appliedInitialRecipeId.current = initialRecipe.id;
      setDraft(structuredClone(initialRecipe)); setBaseline(""); setError(""); setNotice("");
    }
  }, [open, initialRecipe]);
  const images = current.nodes.filter(isBoardImageNode);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const updateBoard = (updated: BoardData): void => { setCurrent(updated); onBoardChanged(updated); };
  const guardDraft = (action: () => void): void => {
    if (busy) return;
    if (dirty) setPendingAction(() => action); else action();
  };
  const selectRecipe = (recipe: ImageDeliveryRecipe): void => guardDraft(() => {
    const copy = structuredClone(recipe);
    setDraft(copy); setBaseline(JSON.stringify(copy)); setError(""); setNotice("");
  });
  const newRecipe = (): void => guardDraft(() => {
    const empty: ImageDeliveryRecipe = { id: crypto.randomUUID(), name: uiText("网站素材交付"), items: [], updatedAt: new Date().toISOString() };
    setDraft(empty); setBaseline(JSON.stringify(empty)); setError(""); setNotice("");
  });
  function sourceFor(nodeId: string): ImageVersionIdentity {
    const node = images.find((image) => image.id === nodeId);
    if (!node) throw new Error(uiText("交付源图片节点已移除，请重新选择。"));
    const source = node.finalVersion ? resolveImageVersion(node, node.finalVersion) : { imagePath: node.imagePath, jobId: node.jobId };
    return { imagePath: source.imagePath, jobId: source.jobId };
  }
  function patchItem(id: string, patch: Partial<ImageDeliveryItem>): void {
    setDraft((value) => value ? { ...value, items: value.items.map((item) => item.id === id ? { ...item, ...patch } : item) } : value);
    setError(""); setNotice("");
  }
  function addFile(): void {
    if (!draft || !images[0]) return;
    try {
      const index = draft.items.length + 1;
      setDraft({ ...draft, items: [...draft.items, {
        id: crypto.randomUUID(), nodeId: images[0].id, sourceVersion: sourceFor(images[0].id),
        purpose: uiText("网站素材"), relativePath: `assets/image-${index}.png`, format: "png"
      }] });
      setError(""); setNotice("");
    } catch (cause) { setError(getWorkbenchErrorMessage(cause)); }
  }
  async function setFinal(nodeId: string, index: string): Promise<void> {
    if (busy) return;
    const node = images.find((image) => image.id === nodeId);
    if (!node) return;
    const version = index === "none" ? null : imageNodeVersions(node)[Number(index)];
    if (version === undefined) return;
    setBusy(true); setError(""); setNotice("");
    try {
      updateBoard(await api.setFinalVersion({ boardId: current.id, nodeId, version: version ? { imagePath: version.imagePath, jobId: version.jobId } : null }));
      setNotice(uiText("最终稿已保存；已有交付配方保持原固定源版本。"));
    } catch (cause) { setError(getWorkbenchErrorMessage(cause)); } finally { setBusy(false); }
  }
  async function save(exportAfter = false): Promise<void> {
    if (!draft || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      validateImageDeliveryRecipe(draft);
      draft.items.forEach((item) => resolveDeliverySource(current, item));
      const updated = await api.saveRecipe({ boardId: current.id, recipe: draft });
      updateBoard(updated);
      const saved = updated.deliveryRecipes!.find((recipe) => recipe.id === draft.id)!;
      setDraft(structuredClone(saved)); setBaseline(JSON.stringify(saved));
      if (exportAfter) {
        const result = await api.exportRecipe({ boardId: current.id, recipeId: saved.id });
        setNotice(uiText(result.ok ? "交付包已导出，包含转换后的图片和 manifest.json。" : "配方已保存，已取消导出。"));
      } else setNotice(uiText("交付配方已保存。"));
    } catch (cause) { setError(getWorkbenchErrorMessage(cause)); } finally { setBusy(false); }
  }
  async function removeRecipe(): Promise<void> {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      updateBoard(await api.removeRecipe({ boardId: current.id, recipeId: draft.id }));
      setDraft(null); setBaseline(""); setNotice(uiText("交付配方已删除，图片保留。"));
    } catch (cause) { setError(getWorkbenchErrorMessage(cause)); } finally { setBusy(false); }
  }
  return <>
    <Dialog open={open} onOpenChange={(value) => guardDraft(() => onOpenChange(value))}>
      <DialogContent className="image-delivery-dialog">
        <DialogTitle>{uiText("最终稿与项目交付")}</DialogTitle>
        <DialogDescription>{uiText("最终稿独立于当前预览版本。配方固定源版本，继续生成或切换版本不会改变交付内容。")}</DialogDescription>
        <div className="image-delivery-scroll">
          <section className="image-delivery-section">
            <h3>{uiText("选定最终稿")}</h3>
            <p>{uiText("先保存画板再开始交付；最终稿保存后立即生效。移除源版本会阻止交付，不会自动换图。")}</p>
            {images.length ? images.map((node, index) => {
              const versions = imageNodeVersions(node);
              const finalIndex = node.finalVersion ? versions.findIndex((version) => sameVersion(version, node.finalVersion!)) : -1;
              return <label className="image-delivery-final-row" key={node.id}>
                <span>{node.title || uiText("图片 {{ui:0}}", [index + 1])}<small>{uiText("当前预览 v{{ui:0}}", [(node.activeVersion ?? versions.length - 1) + 1])}</small></span>
                <select aria-label={uiText("图片 {{ui:0}} 最终稿", [index + 1])} disabled={busy} value={node.finalVersion ? finalIndex < 0 ? "invalid" : String(finalIndex) : "none"} onChange={(event) => void setFinal(node.id, event.target.value)}>
                  <option value="none">{uiText("未选定最终稿")}</option>
                  {node.finalVersion && finalIndex < 0 ? <option value="invalid" disabled>{uiText("最终稿已失效，请重新选择")}</option> : null}
                  {versions.map((version, versionIndex) => <option key={`${version.imagePath}-${version.jobId}`} value={versionIndex}>v{versionIndex + 1} · {version.imagePath.split(/[\\/]/u).pop()}</option>)}
                </select>
              </label>;
            }) : <p>{uiText("画板还没有可交付的图片。")}</p>}
          </section>
          <section className="image-delivery-section">
            <div className="image-delivery-section-heading"><h3>{uiText("项目交付配方")}</h3><Button size="sm" variant="outline" disabled={busy || !images.length} onClick={newRecipe}>{uiText("新建配方")}</Button></div>
            <div className="image-delivery-recipes">{(current.deliveryRecipes ?? []).map((recipe) => <button type="button" className={draft?.id === recipe.id ? "is-active" : ""} key={recipe.id} disabled={busy} onClick={() => selectRecipe(recipe)}>{recipe.name} · {recipe.items.length}</button>)}</div>
            {draft ? <>
              <label className="image-delivery-field"><span>{uiText("配方名称")}</span><Input aria-label={uiText("配方名称")} value={draft.name} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <p>{uiText("每个文件明确用途、固定源版本和相对项目路径。仅填宽或高可保持比例；同时填宽高按指定尺寸缩放。JPEG 的透明区域会铺白底。")}</p>
              {draft.items.map((item, index) => {
                const sourceNode = images.find((image) => image.id === item.nodeId);
                const versions = sourceNode ? imageNodeVersions(sourceNode) : [];
                const selectedVersion = versions.findIndex((version) => sameVersion(version, item.sourceVersion));
                return <fieldset className="image-delivery-file" disabled={busy} key={item.id}>
                  <legend>{uiText("交付文件 {{ui:0}}", [index + 1])}</legend>
                  <div className="image-delivery-grid">
                    <label className="image-delivery-field"><span>{uiText("源图片")}</span><select aria-label={uiText("文件 {{ui:0}} 源图片", [index + 1])} value={item.nodeId} onChange={(event) => {
                      try { patchItem(item.id, { nodeId: event.target.value, sourceVersion: sourceFor(event.target.value) }); } catch (cause) { setError(getWorkbenchErrorMessage(cause)); }
                    }}>{!sourceNode ? <option value={item.nodeId}>{uiText("源图片已移除")}</option> : null}{images.map((node, imageIndex) => <option key={node.id} value={node.id}>{node.title || uiText("图片 {{ui:0}}", [imageIndex + 1])}</option>)}</select></label>
                    <label className="image-delivery-field"><span>{uiText("固定源版本")}</span><select aria-label={uiText("文件 {{ui:0}} 固定源版本", [index + 1])} value={selectedVersion < 0 ? "invalid" : String(selectedVersion)} onChange={(event) => {
                      const version = versions[Number(event.target.value)];
                      if (version) patchItem(item.id, { sourceVersion: { imagePath: version.imagePath, jobId: version.jobId } });
                    }}>{selectedVersion < 0 ? <option value="invalid" disabled>{uiText("固定源版本已失效")}</option> : null}{versions.map((version, versionIndex) => <option key={`${version.imagePath}-${version.jobId}`} value={versionIndex}>v{versionIndex + 1}{sourceNode?.finalVersion && sameVersion(version, sourceNode.finalVersion) ? ` · ${uiText("最终稿")}` : ""}</option>)}</select></label>
                    <label className="image-delivery-field"><span>{uiText("用途")}</span><Input aria-label={uiText("文件 {{ui:0}} 用途", [index + 1])} value={item.purpose} onChange={(event) => patchItem(item.id, { purpose: event.target.value })} placeholder="Hero / Feature illustration" /></label>
                    <label className="image-delivery-field"><span>{uiText("相对项目路径")}</span><Input aria-label={uiText("文件 {{ui:0}} 路径", [index + 1])} value={item.relativePath} onChange={(event) => patchItem(item.id, { relativePath: event.target.value })} placeholder="assets/hero.png" /></label>
                    <label className="image-delivery-field"><span>{uiText("输出格式")}</span><select aria-label={uiText("文件 {{ui:0}} 格式", [index + 1])} value={item.format} onChange={(event) => {
                      const format = event.target.value as ImageDeliveryFormat;
                      patchItem(item.id, { format, relativePath: item.relativePath.replace(/\.[^/.]+$/u, "") + `.${format === "jpeg" ? "jpg" : format}` });
                    }}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
                    {item.format !== "png" ? <label className="image-delivery-field"><span>{uiText("编码质量（1–100）")}</span><Input type="number" min={1} max={100} aria-label={uiText("文件 {{ui:0}} 编码质量", [index + 1])} value={item.quality ?? 90} onChange={(event) => patchItem(item.id, { quality: Number(event.target.value) })} /></label> : null}
                    <div className="image-delivery-dimensions">
                      <label className="image-delivery-field"><span>{uiText("宽度")}</span><Input type="number" min={1} max={16384} aria-label={uiText("文件 {{ui:0}} 宽度", [index + 1])} value={item.width ?? ""} placeholder={uiText("原始")} onChange={(event) => patchItem(item.id, { width: event.target.value ? Number(event.target.value) : undefined })} /></label>
                      <label className="image-delivery-field"><span>{uiText("高度")}</span><Input type="number" min={1} max={16384} aria-label={uiText("文件 {{ui:0}} 高度", [index + 1])} value={item.height ?? ""} placeholder={uiText("原始")} onChange={(event) => patchItem(item.id, { height: event.target.value ? Number(event.target.value) : undefined })} /></label>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, items: draft.items.filter((file) => file.id !== item.id) })}>{uiText("移除此交付文件")}</Button>
                </fieldset>;
              })}
              <Button size="sm" variant="outline" disabled={busy || !images.length || draft.items.length >= 100} onClick={addFile}>{uiText("添加交付文件")}</Button>
            </> : <p>{uiText("新建配方，或选择一个已有配方。导出 ZIP 会附带源版本、用途、真实尺寸、MIME 和 SHA-256 清单。")}</p>}
          </section>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{uiText(error)}</p> : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        <div className="image-delivery-actions">
          {draft && current.deliveryRecipes?.some((recipe) => recipe.id === draft.id) ? <Button variant="ghost" disabled={busy} onClick={() => setPendingAction(() => () => void removeRecipe())}>{uiText("删除配方")}</Button> : null}
          <span>{dirty ? uiText("配方有未保存更改") : ""}</span>
          <Button variant="outline" disabled={busy || !draft?.items.length} onClick={() => void save()}>{uiText("保存配方")}</Button>
          <Button disabled={busy || !draft?.items.length} onClick={() => void save(true)}>{uiText(busy ? "正在处理…" : "保存并导出 ZIP")}</Button>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(pendingAction)} onOpenChange={(value) => { if (!value) setPendingAction(null); }}>
      <DialogContent><DialogTitle>{uiText("确认继续？")}</DialogTitle><DialogDescription>{uiText("切换或关闭会放弃未保存的配方更改；删除配方会保留所有图片。")}</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingAction(null)}>{uiText("继续编辑")}</Button><Button onClick={() => { const action = pendingAction; setPendingAction(null); action?.(); }}>{uiText("确认继续")}</Button></div></DialogContent>
    </Dialog>
  </>;
}
