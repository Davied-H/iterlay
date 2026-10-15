import { useUiText } from "@/i18n";
import { Command, ImagePlus, MousePointer2, Navigation, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAssistantShortcutDescriptor } from "@/lib/assistant-shortcut";

interface CanvasShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const IS_MAC_PLATFORM =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
const MOD = IS_MAC_PLATFORM ? "⌘" : "Ctrl";
const ASSISTANT_SHORTCUT = getAssistantShortcutDescriptor().label;

const groups = [
  {
    title: "图片操作",
    icon: Pencil,
    shortcuts: [
      ["进入编辑模式", "E"],
      ["加入参考图", "R"],
      ["打开切图", "S"],
      ["查看图片详情", "I"],
      ["沉淀为模板", "T"],
      ["创建副本", `${MOD} D`],
      ["复制原图", `⇧ ${MOD} C`],
      ["导出微信表情 / 分享", "W / H"],
      ["下载原图 / 去除背景下载", "D / B"],
      ["上一个 / 下一个版本", "[  ]"],
      ["删除所选图片", "⌫"]
    ]
  },
  {
    title: "选择与画布",
    icon: MousePointer2,
    shortcuts: [
      ["全选", `${MOD} A`],
      ["多选", "Shift 点击"],
      ["复制 / 粘贴节点", `${MOD} C / V`],
      ["撤销 / 重做", `${MOD} Z / ⇧ ${MOD} Z`],
      ["临时平移画布", "Space"],
      ["取消或退出", "Esc"]
    ]
  },
  {
    title: "导航与视图",
    icon: Navigation,
    shortcuts: [
      ["聚焦提示词", "/"],
      ["切换 AI 助手", ASSISTANT_SHORTCUT],
      ["适应整个画板", "Shift 1"],
      ["适应所选内容", "Shift 2"],
      ["切换最近画板", `${MOD} 1-9`],
      ["打开画廊", "G"],
      ["评论模式", "C"],
      ["快捷键帮助", `${MOD} /`]
    ]
  }
] as const;

export function CanvasShortcutHelpDialog({
  open,
  onOpenChange
}: CanvasShortcutHelpDialogProps): React.ReactElement {
  const uiText = useUiText();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl gap-0 overflow-y-auto p-0"
        closeClassName="right-2 top-2 flex h-7 w-7 items-center justify-center p-0 text-muted-foreground opacity-100 transition-[background-color,color,transform] duration-150 hover:bg-muted/70 hover:text-foreground active:scale-95 motion-reduce:transition-none"
      >
        <DialogHeader className="h-11 justify-center border-b border-border px-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold leading-5">
            <Command aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
            {uiText("画板快捷键")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-px bg-border sm:grid-cols-3">
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <section key={group.title} className="min-w-0 bg-popover px-4 py-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  {group.title}
                </h3>
                <dl className="space-y-2.5">
                  {group.shortcuts.map(([label, shortcut]) => (
                    <div key={label} className="flex min-w-0 items-center justify-between gap-3">
                      <dt className="min-w-0 text-[11px] leading-4 text-muted-foreground">{label}</dt>
                      <dd className="shrink-0">
                        <kbd className="inline-flex min-h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-sans text-[10px] font-medium leading-none text-foreground shadow-[0_1px_0_hsl(var(--border))]">
                          {shortcut}
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
          <ImagePlus aria-hidden className="h-3.5 w-3.5" />
          {uiText("单字母快捷键仅在画板前景且未输入文字时生效。")}</div>
      </DialogContent>
    </Dialog>
  );
}
