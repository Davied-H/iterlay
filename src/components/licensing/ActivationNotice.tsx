import { Coins, KeyRound } from "lucide-react";
import type { LicenseState } from "@shared/licensing";
import { Button } from "@/components/ui/button";

interface ActivationNoticeProps {
  state: LicenseState;
  creditBalance?: number;
  creditLoading?: boolean;
  creditError?: string | null;
  onActivate: () => void;
}

export function ActivationNotice({
  state,
  creditBalance,
  creditLoading = false,
  creditError,
  onActivate
}: ActivationNoticeProps): React.ReactElement {
  const trialActive = state === "TRIAL_ACTIVE";
  const creditLabel = creditLoading
    ? "正在读取 Credits"
    : typeof creditBalance === "number"
      ? `${creditBalance} Credits`
      : creditError
        ? "Credits 暂不可用"
        : "Credits 未读取";

  return (
    <aside
      className="fixed left-1/2 top-[60px] z-[19] flex min-h-10 max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-lg bg-popover px-2 py-1.5 text-popover-foreground shadow-md [-webkit-app-region:no-drag] max-[560px]:left-3 max-[560px]:right-3 max-[560px]:translate-x-0"
      aria-label="Iterlay 授权和积分状态"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--favorite)/0.12)] text-[hsl(var(--favorite))]">
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 whitespace-nowrap text-xs font-medium max-[420px]:hidden">
        {trialActive ? "试用中，尚未激活" : "Iterlay 尚未激活"}
      </span>
      <span className="hidden whitespace-nowrap text-xs font-medium max-[420px]:inline">
        {trialActive ? "试用中" : "未激活"}
      </span>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
      <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        <Coins className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{creditLabel}</span>
      </span>
      <Button size="sm" className="ml-1 h-7 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onActivate}>
        激活授权
      </Button>
    </aside>
  );
}
