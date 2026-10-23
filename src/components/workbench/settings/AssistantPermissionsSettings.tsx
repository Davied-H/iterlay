import { useCallback, useEffect, useState } from "react";
import { useUiText } from "@/i18n";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import type { ScreenAccessPolicy, ScreenAccessStatus } from "@shared/screen-access";
import { Button } from "@/components/ui/button";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

export function AssistantPermissionsSettings(): React.ReactElement {
  const uiText = useUiText();
  const [status, setStatus] = useState<ScreenAccessStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setStatus(await getImageWorkbenchApi().getScreenAccessStatus()); setError(""); }
    catch (failure) { setError(getWorkbenchErrorMessage(failure, "无法读取权限设置。")); }
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);
  async function changePolicy(policy: ScreenAccessPolicy): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      await getImageWorkbenchApi().updateSettings({ assistantScreenAccess: policy });
      await load();
    } catch (failure) { setError(getWorkbenchErrorMessage(failure, "权限设置未保存，请重试。")); }
    finally { setSaving(false); }
  }
  return <div className="col-span-full overflow-y-auto p-6" aria-label={uiText("助手权限设置")}>
    <SettingsGroup title={uiText("屏幕访问")}>
      <SettingsRow title={uiText("查看当前屏幕")} description={uiText("助手需要查看屏幕时获取一张截图，用于当前对话模型分析。")}
        control={<select aria-label={uiText("屏幕访问策略")} className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={status?.policy ?? "ask"} disabled={!status || saving} onChange={(event) => void changePolicy(event.target.value as ScreenAccessPolicy)}>
          <option value="ask">{uiText("每次询问")}</option><option value="allow">{uiText("始终允许")}</option><option value="deny">{uiText("不允许")}</option>
        </select>} />
      <SettingsRow title={uiText("授权管理")} description={uiText("改为“每次询问”可撤销持续授权；改为“不允许”后，后续请求不会获取屏幕。已发送给模型的内容无法收回。")}/>
      {status?.platform === "darwin" ? <SettingsRow title={uiText("系统屏幕录制权限")}
        description={uiText(status.systemPermission === "granted" ? "系统已允许屏幕访问。" : "还需要在 macOS 系统设置中允许 Iterlay 录制屏幕。")}
        control={<Button variant="outline" size="sm" onClick={() => void getImageWorkbenchApi().openScreenCaptureSettings().catch((failure) => setError(getWorkbenchErrorMessage(failure, "无法打开系统设置。")))}>{uiText("打开系统设置")}</Button>} /> : null}
    </SettingsGroup>
    {error ? <div className="mt-4 text-sm text-destructive" role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => void load()}>{uiText("重试")}</Button></div> : null}
  </div>;
}
