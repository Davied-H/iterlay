import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentSkillUpgradeDetail } from "@shared/agent-integration";
import { SkillUpgradeDetailsDialog } from "@/components/workbench/SkillUpgradeDetailsDialog";
import { iterlayToast } from "@/components/ui/iterlay-toast";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import "@/styles.css";

const details: AgentSkillUpgradeDetail[] = [
  {
    client: "codex",
    skillPath: "/Users/demo/.codex/skills/iterlay-workspace",
    currentDigest: "0d8c7f2d",
    upgradedAt: new Date().toISOString(),
    files: {
      added: ["references/video-workflow.md"],
      updated: ["SKILL.md", "references/mcp-tools.md", "scripts/validate-image-batch.mjs"],
      removed: ["references/legacy-tools.md"]
    }
  },
  {
    client: "claude-code",
    skillPath: "/Users/demo/.claude/skills/iterlay-workspace",
    previousDigest: "9a12ec0b",
    currentDigest: "0d8c7f2d",
    upgradedAt: new Date().toISOString(),
    files: {
      added: ["references/video-workflow.md"],
      updated: ["SKILL.md", "references/mcp-tools.md"],
      removed: []
    }
  }
];

function Preview(): React.ReactElement {
  const [open, setOpen] = useState(new URLSearchParams(window.location.search).get("dialog") === "1");
  const showToast = useCallback((): void => {
    iterlayToast.update({
      badge: "Skill",
      title: "Iterlay Skill 已升级",
      detail: "已同步到 2 个 Coding Agent",
      actionLabel: "查看详情",
      onOpen: () => setOpen(true)
    });
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("dialog") !== "1") {
      const frame = window.requestAnimationFrame(showToast);
      return () => window.cancelAnimationFrame(frame);
    }
  }, [showToast]);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold">Coding Agent</h1>
          <p className="text-xs text-muted-foreground">Iterlay Workspace 集成</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={showToast}>重播通知</Button>
      </header>
      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="border-b border-border pb-5">
          <h2 className="text-sm font-semibold">MCP 集成</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Codex 与 Claude Code 已连接，Skill 将随 Iterlay 自动保持最新。</p>
        </div>
      </section>
      <SkillUpgradeDetailsDialog open={open} details={details} onOpenChange={setOpen} />
      <Toaster theme="light" position="top-center" />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
