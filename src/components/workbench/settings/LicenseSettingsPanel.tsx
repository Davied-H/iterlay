import { useUiText } from "@/i18n";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import type { LicenseStatusSnapshot } from "@shared/licensing";
import { getLicenseStatusLabel } from "@/components/licensing/license-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SettingsGroup, SettingsRow } from "./SettingsPrimitives";

export function LicenseSettingsPanel({
  status,
  busy,
  onOpenCenter,
  onActivate
}: {
  status: LicenseStatusSnapshot | null;
  busy: boolean;
  onOpenCenter: () => void;
  onActivate: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const licensed = status?.state === "LICENSED";
  const statusLabel = getLicenseStatusLabel(status?.state ?? null);
  const detail = !status
    ? "正在读取当前设备的授权信息。"
    : licensed
      ? "当前设备已获得 Iterlay 正式授权。"
      : status.state === "TRIAL_ACTIVE"
        ? "当前处于试用期，可随时输入激活码升级为正式授权。"
        : "激活正式授权后，可持续使用完整的生成与编辑能力。";

  return (
    <>
      <SettingsGroup title={uiText("授权与激活")}>
        <SettingsRow
          title={uiText("Iterlay 桌面版")}
          description={detail}
          control={(
            <span
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                licensed
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-foreground/[0.055] text-muted-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className={cn("h-1.5 w-1.5 rounded-full", licensed ? "bg-emerald-500" : "bg-muted-foreground")}
              />
              {statusLabel}
            </span>
          )}
        />
        {status?.licenseEmail ? <SettingsRow title={uiText("授权邮箱")} description={status.licenseEmail} /> : null}
        {status?.activatedAt ? <SettingsRow title={uiText("激活时间")} description={formatLicenseDateTime(status.activatedAt)} /> : null}
        <SettingsRow
          title={licensed ? uiText("授权管理") : uiText("激活授权")}
          description={licensed ? uiText("查看授权详情、设备名额和客户中心。") : uiText("使用购买邮箱和激活码授权当前设备。")}
          control={(
            <Button
              type="button"
              variant={licensed ? "outline" : "default"}
              disabled={busy || !status}
              className="shrink-0"
              onClick={licensed ? onOpenCenter : onActivate}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : licensed ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
              {licensed ? uiText("管理授权") : uiText("激活授权")}
            </Button>
          )}
        />
      </SettingsGroup>
    </>
  );
}

function formatLicenseDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
