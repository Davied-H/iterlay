import { getUiTextLocale } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { CheckCircle2, FilePenLine, FilePlus2, FileX2, RefreshCw } from "lucide-react";
import type { AgentSkillUpgradeDetail } from "@shared/agent-integration";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SkillUpgradeDetailsDialogProps {
  open: boolean;
  details: AgentSkillUpgradeDetail[];
  onOpenChange: (open: boolean) => void;
}

const clientLabels: Record<AgentSkillUpgradeDetail["client"], string> = {
  codex: "Codex",
  "claude-code": "Claude Code"
};

export function SkillUpgradeDetailsDialog({
  open,
  details,
  onOpenChange
}: SkillUpgradeDetailsDialogProps): React.ReactElement {
  const uiText = useUiText();

  const changedFileCount = details.reduce(
    (total, detail) => total + detail.files.added.length + detail.files.updated.length + detail.files.removed.length,
    0
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(680px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--success-muted))] text-[hsl(var(--success))]">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{uiText("Iterlay Skill 已升级")}</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                {uiText("已同步 ")}{details.length} {uiText("个 Coding Agent，共变更 ")}{changedFileCount} {uiText("个文件。")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          {details.map((detail) => (
            <section className="border-b border-border px-6 py-5 last:border-b-0" key={detail.client}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">{clientLabels[detail.client]}</h3>
                <time className="ml-auto text-[11px] text-muted-foreground" dateTime={detail.upgradedAt}>
                  {formatUpgradeTime(detail.upgradedAt)}
                </time>
              </div>
              <p className="mt-2 break-all font-mono text-[11px] leading-5 text-muted-foreground">{detail.skillPath}</p>
              <div className="mt-4 space-y-3">
                <FileChangeList icon={<FilePlus2 />} label={uiText("新增")} paths={detail.files.added} tone="success" />
                <FileChangeList icon={<FilePenLine />} label={uiText("更新")} paths={detail.files.updated} tone="info" />
                <FileChangeList icon={<FileX2 />} label={uiText("移除")} paths={detail.files.removed} tone="muted" />
              </div>
            </section>
          ))}
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>{uiText("完成")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileChangeList({
  icon,
  label,
  paths,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  paths: string[];
  tone: "success" | "info" | "muted";
}): React.ReactElement | null {
  if (paths.length === 0) return null;
  const toneClass = tone === "success"
    ? "text-[hsl(var(--success))]"
    : tone === "info"
      ? "text-[hsl(var(--helper-line))]"
      : "text-muted-foreground";
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-xs leading-5">
      <div className={`flex items-start gap-1.5 font-medium ${toneClass}`}>
        <span className="mt-0.5 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">{icon}</span>
        <span>{label} {paths.length}</span>
      </div>
      <ul className="min-w-0 space-y-1 text-muted-foreground">
        {paths.map((filePath) => <li className="break-all font-mono text-[11px]" key={filePath}>{filePath}</li>)}
      </ul>
    </div>
  );
}

function formatUpgradeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat(getUiTextLocale(), { hour: "2-digit", minute: "2-digit" }).format(date);
}
