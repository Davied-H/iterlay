import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Images,
  Loader2,
  RefreshCw,
  X
} from "lucide-react";
import type { AssetDetailData, AssetReference, AssetVersion } from "@shared/types";
import { getImageWorkbenchApi } from "@/lib/image-workbench-api";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GeneratedImage } from "./ImageNode";
import { railMotion } from "@/components/workbench/HistoryRail";

interface ImageDetailsPanelProps {
  boardId: string;
  image: GeneratedImage;
  onClose: () => void;
  onCopyText: (text: string) => void;
  onCopyReferences: (references: AssetReference[]) => Promise<void> | void;
  onOpenAssistant: (conversationId: string) => void;
}

export function ImageDetailsPanel({
  boardId,
  image,
  onClose,
  onCopyText,
  onCopyReferences,
  onOpenAssistant
}: ImageDetailsPanelProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [detail, setDetail] = useState<AssetDetailData | null>(null);
  const [activeVersion, setActiveVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [copyingReferences, setCopyingReferences] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void getImageWorkbenchApi().getAssetDetail(boardId, image.id).then((data) => {
      if (cancelled) return;
      setDetail(data);
      setActiveVersion(data.activeVersion);
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [boardId, image.id, reloadNonce]);

  const versions = detail?.versions ?? [];
  const version: AssetVersion | undefined = versions[activeVersion];
  const previewUrl = version?.dataUrl || image.dataUrl;
  const prompt = version?.prompt.trim() ?? "";
  const references = version?.references ?? [];
  const versionLabel = versions.length > 1 ? `v${activeVersion + 1}` : undefined;
  const meta = useMemo(() => [version?.model, version?.size].filter(Boolean).join(" · "), [version]);

  function copyPrompt(): void {
    if (!prompt) return;
    onCopyText(prompt);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1400);
  }

  async function copyReferences(): Promise<void> {
    if (references.length === 0 || copyingReferences) return;
    setCopyingReferences(true);
    try {
      await onCopyReferences(references);
    } finally {
      setCopyingReferences(false);
    }
  }

  return (
    <motion.aside
      {...railMotion}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      aria-label="图片详情"
      className="pointer-events-auto absolute bottom-4 right-4 top-16 z-20 flex w-[calc(100%-2rem)] max-w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_12px_hsl(0_0%_0%/0.14)]"
    >
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-semibold">图片详情</h2>
          {versionLabel ? <span className="text-[11px] tabular-nums text-muted-foreground">{versionLabel}</span> : null}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="关闭图片详情">
          <X className="h-4 w-4" />
        </Button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground" aria-busy="true">
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm font-medium">详情读取失败</p>
          <p className="text-xs leading-5 text-muted-foreground">图片仍可正常使用，可以重新读取生成记录。</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReloadNonce((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-border bg-muted/25 p-4">
            <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-border/70">
              {previewUrl ? <img src={previewUrl} alt={`图片${versionLabel ? ` ${versionLabel}` : ""}`} className="h-full w-full object-contain" /> : null}
            </div>
            {versions.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5" aria-label="图片版本">
                {versions.map((item, index) => (
                  <button
                    key={`${item.imagePath}:${index}`}
                    type="button"
                    onClick={() => setActiveVersion(index)}
                    aria-label={`查看版本 ${index + 1}`}
                    aria-pressed={index === activeVersion}
                    className={cn(
                      "relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted ring-1 transition-[opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      index === activeVersion ? "opacity-100 ring-2 ring-foreground" : "opacity-60 ring-border hover:opacity-100"
                    )}
                  >
                    <img src={item.dataUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-background/90 px-1 text-[9px] font-medium tabular-nums">v{index + 1}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <section className="border-b border-border px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold">提示词</h3>
                {meta ? <p className="mt-0.5 text-[10px] text-muted-foreground">{meta}</p> : null}
              </div>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={!prompt} onClick={copyPrompt}>
                      {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedPrompt ? "已复制" : "复制提示词"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制当前版本的提示词</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {prompt ? (
              <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">{prompt}</p>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">这张图片没有生成提示词。</p>
            )}
          </section>

          <section className="border-b border-border px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Images className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold">引用图片</h3>
                {references.length > 0 ? <span className="text-[10px] tabular-nums text-muted-foreground">{references.length}</span> : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={references.length === 0 || copyingReferences}
                onClick={() => void copyReferences()}
              >
                {copyingReferences ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Copy className="h-3.5 w-3.5" />}
                复制引用
              </Button>
            </div>
            {references.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {references.map((reference, index) => (
                  <div key={`${reference.imagePath}:${index}`} className="aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-inset ring-border/70">
                    <img src={reference.dataUrl} alt={`引用图片 ${index + 1}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">当前版本没有引用其他图片。</p>
            )}
          </section>

          {version?.assistantConversationId ? (
            <section className="border-t border-border px-4 py-3">
              <div className="flex items-center gap-2.5 rounded-lg bg-[hsl(var(--ai-muted))] p-2.5 ring-1 ring-inset ring-[hsl(var(--ai-accent)/0.14)] transition-colors duration-200 hover:bg-[hsl(var(--ai-muted))]/75 motion-reduce:transition-none">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80 text-[hsl(var(--ai-accent))] shadow-[0_1px_2px_hsl(0_0%_0%/0.08)] dark:bg-background/35">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-semibold text-foreground">AI 生成记录</h3>
                  <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">回看本次生成的对话与绘画过程</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 bg-background/85 px-2 text-[11px] text-[hsl(var(--ai-accent))] shadow-[0_1px_2px_hsl(0_0%_0%/0.08)] hover:bg-background focus-visible:ring-[hsl(var(--ai-accent))] dark:bg-background/35 dark:hover:bg-background/50"
                  onClick={() => onOpenAssistant(version.assistantConversationId!)}
                >
                  查看记录
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </motion.aside>
  );
}
