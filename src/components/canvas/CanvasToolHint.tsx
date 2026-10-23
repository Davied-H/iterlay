import { useState, type ReactElement } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useUiText } from "@/i18n";

export type CanvasToolHintKind = "canvas" | "select" | "pan" | "image" | "video" | "text" | "fit" | "more";
export const CANVAS_TOOL_HINTS = {
  canvas: { title: "添加 Canvas", description: "编写 HTML、React 或 Vue，运行交互预览。", shortcut: "", aria: undefined },
  select: { title: "选择", description: "选择、移动画布中的内容，拖拽框选多个节点。", shortcut: "V", aria: "V" },
  pan: { title: "平移", description: "拖动画布浏览内容，也可按住空格临时平移。", shortcut: "H", aria: "H" },
  image: { title: "生成图片", description: "添加图片生成卡，输入描述并连接参考图。", shortcut: "Shift I", aria: "Shift+I" },
  video: { title: "生成视频", description: "添加视频生成卡，从文字或图片开始创作。", shortcut: "Shift V", aria: "Shift+V" },
  text: { title: "添加文本", description: "记录想法、编写提示词，并连接到生成卡。", shortcut: "Shift T", aria: "Shift+T" },
  fit: { title: "适应画布", description: "缩放并居中，查看画布中的全部内容。", shortcut: "Shift 1", aria: "Shift+1" },
  more: { title: "更多画布工具", description: "打开已启用的插件工具，拓展创作流程。", shortcut: "", aria: undefined }
} as const;

function ToolIllustration({ kind }: { kind: CanvasToolHintKind }): ReactElement {
  return <svg className="canvas-tool-hint__art" viewBox="0 0 240 128" aria-hidden="true" fill="none">
    <defs><pattern id={`tool-dots-${kind}`} width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r=".7" fill="currentColor" opacity=".18" /></pattern></defs>
    <path fill={`url(#tool-dots-${kind})`} d="M0 0h240v128H0z" />
    {(kind === "image" || kind === "video") ? <>
      <rect x="48" y="24" width="144" height="82" rx="7" className="canvas-tool-hint__paper" />
      <path d="m50 91 40-35 31 26 24-18 45 35H50Z" className="canvas-tool-hint__landscape" />
      <circle cx="151" cy="45" r="10" className="canvas-tool-hint__sun" />
      {kind === "video" ? <><circle cx="120" cy="65" r="17" className="canvas-tool-hint__paper" /><path d="m116 57 12 8-12 8Z" fill="currentColor" /></> : <path d="m68 36 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="currentColor" />}
    </> : kind === "text" ? <>
      <rect x="52" y="22" width="136" height="86" rx="6" className="canvas-tool-hint__paper" />
      <path d="M69 43h34m-17 0v36m-7 0h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M116 47h52m-52 13h44m-44 13h49M70 94h91" stroke="currentColor" opacity=".3" strokeWidth="3" strokeLinecap="round" />
    </> : kind === "more" ? <>
      {[58, 101, 144].map((x, i) => <g key={x}><rect x={x} y={37 + i * 5} width="38" height="42" rx="6" className="canvas-tool-hint__paper" /><path d={`M${x + 12} ${58 + i * 5}h14m-7-7v14`} stroke="currentColor" strokeWidth="2" /></g>)}
    </> : <>
      <rect x="49" y="33" width="62" height="51" rx="5" className="canvas-tool-hint__paper" />
      <rect x="127" y="49" width="59" height="43" rx="5" className="canvas-tool-hint__landscape" />
      {kind === "select" ? <><path d="M40 23h157v79H40Z" stroke="currentColor" strokeDasharray="4 3" opacity=".5" />{[[40,23],[197,23],[40,102],[197,102]].map(([x,y]) => <rect key={`${x}-${y}`} x={x-2} y={y-2} width="4" height="4" className="canvas-tool-hint__paper" />)}<path d="m104 58 6 29 7-10 12-3Z" fill="currentColor" /></> : kind === "fit" ? <path d="M33 42V20h24m126 0h24v22M33 86v22h24m126 0h24V86" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <><path d="M24 64h17m-5-5 5 5-5 5m180-5h-17m5-5-5 5 5 5M120 15v16m-5-5 5 5 5-5m-5 87V97m-5 5 5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M104 79V60a3 3 0 0 1 6 0v8-21a3 3 0 0 1 6 0v19-23a3 3 0 0 1 6 0v23-18a3 3 0 0 1 6 0v23l5-5a4 4 0 0 1 6 5l-10 18h-18Z" className="canvas-tool-hint__paper" /></>}
    </>}
  </svg>;
}

export function CanvasToolHint({ kind, children }: { kind: CanvasToolHintKind; children: ReactElement }): ReactElement {
  const uiText = useUiText();
  const hint = CANVAS_TOOL_HINTS[kind];
  const [open, setOpen] = useState(false);
  return <Tooltip.Root open={open} onOpenChange={setOpen}><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal>
    <Tooltip.Content side="right" align="center" sideOffset={12} collisionPadding={12} className="canvas-tool-hint" aria-label={`${uiText(hint.title)}. ${uiText(hint.description)} ${hint.shortcut}`} onEscapeKeyDown={event => { event.preventDefault(); setOpen(false); }}>
      <ToolIllustration kind={kind} />
      <div className="canvas-tool-hint__body"><div className="canvas-tool-hint__heading"><strong>{uiText(hint.title)}</strong>{hint.shortcut ? <kbd>{hint.shortcut}</kbd> : null}</div><p>{uiText(hint.description)}</p></div>
    </Tooltip.Content>
  </Tooltip.Portal></Tooltip.Root>;
}

export { Provider as CanvasToolHintProvider } from "@radix-ui/react-tooltip";
