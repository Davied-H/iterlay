import { useUiText } from "@/i18n";
import { motion, useReducedMotion } from "framer-motion";
import { Images, Trash2, X } from "lucide-react";
import type { AssetComment } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { railMotion } from "@/components/workbench/HistoryRail";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface CommentRailProps {
  comments: AssetComment[];
  /** 取某张图片的缩略图 dataUrl（图片已不在画布时返回 undefined）。 */
  thumbFor: (imagePath: string) => string | undefined;
  onFocusImage: (imagePath: string) => void;
  onDeleteComment: (id: string) => void;
  onClose: () => void;
}

/** 评论浮层：与历史栏同款视觉与弹入弹出动画，列出每条评论记录。 */
export function CommentRail({
  comments,
  thumbFor,
  onFocusImage,
  onDeleteComment,
  onClose
}: CommentRailProps): React.ReactElement {
  const uiText = useUiText();

  const reduceMotion = useReducedMotion();
  return (
    <motion.aside
      {...railMotion}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE_OUT }}
      className="pointer-events-auto absolute bottom-4 right-4 top-16 z-10 flex w-[320px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{uiText("评论")}</span>
          <Badge variant="muted">{comments.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={uiText("收起评论")}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-2 p-3">
          {comments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm leading-relaxed text-muted-foreground">
              {uiText("还没有评论。按 C 进入评论模式，点击画布上的图片即可添加评论建议。")}</p>
          ) : (
            comments.map((comment) => {
              const thumb = thumbFor(comment.imagePath);
              return (
                <div
                  key={comment.id}
                  className="group relative flex gap-2.5 overflow-hidden rounded-xl border border-border bg-background/60 p-3 transition-colors [contain-intrinsic-size:auto_68px] [content-visibility:auto] hover:border-ring/60 hover:bg-accent/60"
                >
                  <button
                    type="button"
                    onClick={() => onFocusImage(comment.imagePath)}
                    title={uiText("定位到画布图片")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <Images className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="break-words pr-6 text-sm leading-snug text-foreground">{comment.text}</p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteComment(comment.id)}
                    aria-label={uiText("删除评论")}
                    title={uiText("删除评论")}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.aside>
  );
}
