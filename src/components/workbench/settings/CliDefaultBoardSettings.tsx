import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import { useUiText } from "@/i18n";
import type { BoardSummary } from "@shared/types";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

export function CliDefaultBoardSettings({ disabled }: { disabled: boolean }): React.ReactElement {
  const uiText = useUiText();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (disabled) return;
    let disposed = false;
    setError(null);
    const api = getImageWorkbenchApi();
    void Promise.all([api.getSettings(), api.listBoards()]).then(([settings, available]) => {
      if (disposed) return;
      setBoardId(settings.cliDefaultBoardId ?? "");
      setBoards(available);
    }).catch((cause) => {
      if (!disposed) setError(getWorkbenchErrorMessage(cause, "无法加载默认画板，请重试。"));
    });
    return () => { disposed = true; };
  }, [disabled, loadAttempt]);

  async function changeBoard(next: string): Promise<void> {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await getImageWorkbenchApi().updateSettings({ cliDefaultBoardId: next });
      setBoardId(next);
      setSaved(true);
    } catch (cause) {
      setError(getWorkbenchErrorMessage(cause, "默认画板保存失败，请重试。"));
    } finally { setSaving(false); }
  }

  const missing = Boolean(boardId && boards && !boards.some((board) => board.id === boardId));
  return <SettingsGroup title="CLI 创作">
    <SettingsRow title="默认画板" description="未指定 --board 时，CLI 生成的图片和视频会自动保存到此画板。" stackControlOnNarrow control={
      !boards && !error ? <Skeleton className="h-9 w-48" /> : <select
        aria-label={uiText("CLI 默认画板")}
        className="h-9 w-56 max-w-full rounded-md border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        value={boardId}
        disabled={disabled || saving || !boards}
        onChange={(event) => void changeBoard(event.target.value)}
      >
        <option value="">{uiText("自动使用「CLI 创作」")}</option>
        {missing ? <option value={boardId} disabled>{uiText("原画板已删除，请重新选择")}</option> : null}
        {boards?.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
      </select>
    } />
    <p className="coding-agent-note">{uiText("自动模式会复用或创建「CLI 创作」画板。使用 --board 可为单次生成指定其他画板。")}</p>
    {missing ? <p className="coding-agent-error" role="alert">{uiText("默认画板已不可用，请重新选择后再通过 CLI 生成。")}</p> : null}
    {error ? <div className="coding-agent-error" role="alert"><p>{uiText(error)}</p>{!boards ? <Button variant="outline" size="sm" disabled={disabled} onClick={() => setLoadAttempt((current) => current + 1)}>{uiText("重新加载")}</Button> : null}</div> : null}
    <span className="coding-agent-note" role="status">{saving ? uiText("正在保存…") : saved ? uiText("默认画板已保存") : ""}</span>
  </SettingsGroup>;
}
