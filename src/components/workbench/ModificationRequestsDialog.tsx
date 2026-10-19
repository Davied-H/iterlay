import { useEffect, useId, useRef, useState } from "react";
import { useUiText } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import type { ModificationStatus, PublicModificationRequest } from "@shared/modification-requests";

const STATUS_LABELS: Record<ModificationStatus, string> = {
  "needs-input": "需要补充要求",
  ready: "等待 Agent 接手",
  claimed: "Agent 已接手",
  succeeded: "已完成",
  failed: "处理失败"
};

interface ModificationRequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  onFocus: (nodeId: string) => void;
}

export function ModificationRequestsDialog({ open, onOpenChange, boardId, onFocus }: ModificationRequestsDialogProps) {
  const uiText = useUiText();
  const instructionId = useId();
  const sessionRef = useRef(0);
  const [items, setItems] = useState<PublicModificationRequest[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [instruction, setInstruction] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const session = ++sessionRef.current;
    setItems([]);
    setSelectedId("");
    setError("");
    setNotice("");
    setBusy(true);
    void getImageWorkbenchApi().listModificationRequests(boardId)
      .then((requests) => { if (sessionRef.current === session) setItems(requests); })
      .catch((caught) => { if (sessionRef.current === session) setError(getWorkbenchErrorMessage(caught, "读取修改请求失败，请重试。")); })
      .finally(() => { if (sessionRef.current === session) setBusy(false); });
    return () => { sessionRef.current += 1; };
  }, [open, boardId]);

  useEffect(() => {
    setInstruction(selected?.instruction ?? "");
  }, [selected?.id, selected?.instruction]);

  async function runAction(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    const session = sessionRef.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (caught) {
      if (sessionRef.current === session) setError(getWorkbenchErrorMessage(caught, "操作失败，请重试。"));
    } finally {
      if (sessionRef.current === session) setBusy(false);
    }
  }

  async function refresh(): Promise<void> {
    const session = sessionRef.current;
    const requests = await getImageWorkbenchApi().listModificationRequests(boardId);
    if (sessionRef.current === session) setItems(requests);
  }

  async function saveInstruction(): Promise<void> {
    if (!selected || !instruction.trim()) return;
    const session = sessionRef.current;
    const updated = await getImageWorkbenchApi().clarifyModificationRequest(selected.id, instruction.trim());
    if (sessionRef.current !== session) return;
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    setNotice("修改要求已保存，等待 Agent 接手；尚未执行生成。");
  }

  async function copyHandoff(): Promise<void> {
    if (!selected) return;
    const session = sessionRef.current;
    const handoff = uiText("请使用 Iterlay CLI 的 iterlay call 接手修改请求 {{ui:0}}。先用 get_modification_request 读取固定源图、源版本、annotationPath、maskPath、修改要求和约束；信息不足时用 clarify_modification_request 澄清。用 claim_modification_request 领取并保存其返回的 claimToken；调用 edit_image 时传入 modificationRequestId 与 claimToken，按请求固定源图执行，不另建无关联的生成任务。完成后用 finish_modification_request 关联真实 resultJobId 与 resultPaths。保存或复制说明不会调用模型，执行图片编辑才可能产生费用。", [selected.id]);
    try {
      await navigator.clipboard.writeText(handoff);
      if (sessionRef.current === session) setNotice("接手说明已复制，可粘贴给 Codex 或 Claude Code。");
    } catch {
      if (sessionRef.current === session) setError(uiText("复制失败，请使用请求编号：{{ui:0}}", [selected.id]));
    }
  }

  const editable = selected?.status !== "claimed" && selected?.status !== "succeeded";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" aria-busy={busy || undefined}>
        <DialogHeader>
          <DialogTitle>{uiText("Agent 修改请求")}</DialogTitle>
          <DialogDescription>{uiText("保存的意见固定到源图片和版本。保存、补充要求均不调用模型；Agent 接手后执行生成才可能产生费用。")}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{uiText(error)}</p> : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{uiText(notice)}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{uiText("{{ui:0}} 条请求", [items.length])}</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(refresh)}>{uiText("刷新状态")}</Button>
        </div>
        {items.length === 0 ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">{uiText(busy ? "正在读取修改请求…" : "在图片的高级编辑或 Relax Flow 中选择“保存给 Agent”。标注和修改要求会作为独立请求保留。")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[190px_minmax(0,1fr)]">
            <nav aria-label={uiText("修改请求列表")} className="flex flex-col gap-1">
              {items.map((item) => (
                <button type="button" key={item.id} disabled={busy} onClick={() => { setSelectedId(item.id); setNotice(""); setError(""); }} aria-current={selected?.id === item.id ? "true" : undefined} className={`rounded-md p-2 text-left text-sm disabled:opacity-60 ${selected?.id === item.id ? "bg-muted" : "hover:bg-muted/60"}`}>
                  <span className="block truncate">{item.instruction || uiText("未填写修改要求")}</span>
                  <span className="text-xs text-muted-foreground">{uiText(STATUS_LABELS[item.status])}</span>
                </button>
              ))}
            </nav>
            {selected ? (
              <section className="min-w-0 space-y-3" aria-label={uiText("修改请求详情")}>
                <div className="text-sm">
                  <strong>{uiText(STATUS_LABELS[selected.status])}</strong>
                  <p className="mt-1 text-xs text-muted-foreground break-all">{uiText("固定源版本：{{ui:0}}", [selected.sourceVersionId])}</p>
                </div>
                <label htmlFor={instructionId} className="block text-sm font-medium">{uiText("请求修改要求")}</label>
                <Textarea id={instructionId} value={instruction} disabled={busy || !editable} onChange={(event) => setInstruction(event.target.value)} className="min-h-28" />
                {selected.clarification ? <p className="text-sm">{uiText(selected.clarification)}</p> : null}
                {selected.error ? <p role="alert" className="text-sm text-destructive">{uiText(selected.error)}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {uiText("{{ui:0}} 个相对区域", [selected.regions.length])}
                  {selected.maskPath ? <> · {uiText("包含区域蒙版")}</> : null}
                  {selected.annotationPath ? <> · {uiText("包含标注截图")}</> : null}
                  {selected.claim ? <> · {uiText("接手者：{{ui:0}}", [selected.claim.owner])}</> : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  {editable ? <Button size="sm" disabled={busy || !instruction.trim()} onClick={() => void runAction(saveInstruction)}>{uiText("保存修改要求")}</Button> : null}
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(copyHandoff)}>{uiText("复制接手说明")}</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => { onFocus(selected.nodeId); onOpenChange(false); }}>{uiText("定位源图")}</Button>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">{uiText("请求编号与诊断")}</summary>
                  <pre className="whitespace-pre-wrap break-all mt-2">{JSON.stringify({ id: selected.id, sourcePath: selected.sourcePath, annotationPath: selected.annotationPath, maskPath: selected.maskPath, resultPaths: selected.resultPaths }, null, 2)}</pre>
                </details>
              </section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
