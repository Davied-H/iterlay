import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { useUiText } from "@/i18n";
import type { CodingAgentIntegrationStatus } from "@shared/agent-integration";
const dismissedThisSession = new Set<string>();
function isDismissed(reason: string): boolean {
  if (dismissedThisSession.has(reason)) return true;
  try { return localStorage.getItem(`iterlay:agent-hint:v1:${reason}`) === "dismissed"; } catch { return false; }
}
export function CodingAgentHint({ paused, providerReady, onOpen }: { paused: boolean; providerReady: boolean; onOpen: (destination: "provider-setup" | "coding-agent") => void }): React.ReactElement | null {
  const uiText = useUiText();
  const [status, setStatus] = useState<CodingAgentIntegrationStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, checkedAt = 0;
    const refresh = () => {
      if (Date.now() - checkedAt < 1000) return;
      checkedAt = Date.now();
      void getImageWorkbenchApi().getCodingAgentStatus().then((value) => { if (!disposed) setStatus(value); }).catch(() => undefined);
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("iterlay:agent-status-changed", refresh);
    return () => { disposed = true; window.removeEventListener("focus", refresh); window.removeEventListener("iterlay:agent-status-changed", refresh); };
  }, []);
  if (!status) return null;
  const pending = status.clients.filter((agent) => agent.detected && (!agent.skillInstalled || agent.legacyConfigured));
  const reason = !status.cli.installed || status.cli.error ? "cli" : !providerReady ? "provider" : pending.length ? `agents:${pending.map((agent) => agent.id).sort().join(",")}` : null;
  if (!reason || paused || reason === dismissed || isDismissed(reason)) return null;
  const title = reason === "cli" ? "命令行工具还需准备" : reason === "provider" ? "先配置一个图片服务" : "让 Coding Agent 使用 Iterlay";
  const description = reason === "cli" ? "在设置中完成 CLI 安装，即可从终端和 Coding Agent 使用 App 的创作能力。" : reason === "provider" ? "配置一次，App、CLI 和 Coding Agent 都能使用这里的模型和授权。" : "已检测到支持的 Coding Agent，安装 Skill 后就能直接生成图片和管理画板。";
  const dismiss = () => { dismissedThisSession.add(reason); setDismissed(reason); try { localStorage.setItem(`iterlay:agent-hint:v1:${reason}`, "dismissed"); } catch { /* Session opt-out still works. */ } };
  return (
    <Popover open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none fixed right-5 top-28 size-px" aria-hidden="true" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-lg p-4 shadow-lg"
        aria-label={uiText(title)}
      >
        <div className="flex min-h-7 items-center justify-between gap-3">
          <h3 className="min-w-0 text-[13px] font-medium leading-5">{uiText(title)}</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground [&_svg]:size-4"
            aria-label={uiText("关闭此提醒")}
            onClick={dismiss}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-1.5 break-words text-xs leading-5 text-muted-foreground">{uiText(description)}</p>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => { dismiss(); onOpen(reason === "provider" ? "provider-setup" : "coding-agent"); }}
          >
            {uiText(reason === "provider" ? "配置图片服务" : "前往设置")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
