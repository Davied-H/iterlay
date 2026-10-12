import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PanelTop } from "lucide-react";
import { MasterGoReconstructionTaskState } from "@/components/workbench/MasterGoReconstructionDialog";
import { Button } from "@/components/ui/button";
import type { MasterGoReconstructionStage, MasterGoReconstructionTask } from "@shared/mastergo-reconstruction";
import sourceImage from "@/assets/tour-demo-lamp.jpg";
import "@/styles.css";

const frames: Array<{ stage: MasterGoReconstructionStage; progress: number; message: string }> = [
  { stage: "preparing", progress: 10, message: "正在提取源图尺寸与色彩信息" },
  { stage: "planning", progress: 20, message: "Pi Agent 正在获取 MasterGo 页面规则" },
  { stage: "planning", progress: 25, message: "正在读取当前页面的可用组件" },
  { stage: "analyzing", progress: 39, message: "正在识别页面区域、文字与图片素材" },
  { stage: "analyzing", progress: 49, message: "正在归类可复用元素" },
  { stage: "building", progress: 63, message: "正在构建可编辑图层与布局结构" },
  { stage: "submitting", progress: 81, message: "正在通过官方 MCP 写入 MasterGo 画布" },
  { stage: "rendering", progress: 92, message: "正在核验最终图层与视觉结果" }
];

function Preview(): React.ReactElement {
  const auto = new URLSearchParams(window.location.search).get("auto") === "1";
  const [frameIndex, setFrameIndex] = useState(2);
  const frame = frames[frameIndex]!;
  const task: MasterGoReconstructionTask = {
    id: "motion-preview",
    status: "running",
    stage: frame.stage,
    progress: frame.progress,
    message: frame.message,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, 1_600);
    return () => window.clearInterval(timer);
  }, [auto]);

  return <main className="flex min-h-screen items-center justify-center bg-[#f1f2f4] p-8">
    <div className="w-[640px] overflow-hidden rounded-xl bg-background shadow-xl">
      <header className="flex items-center gap-2 px-5 pb-2 pt-4">
        <h1 className="flex shrink-0 items-center gap-2 text-base font-semibold"><PanelTop className="h-4 w-4" />还原为可编辑设计稿</h1>
        <span className="text-border" aria-hidden="true">·</span>
        <p className="text-xs leading-5 text-muted-foreground">拆分 UI 元素，通过 MasterGo MCP 写入当前页面。</p>
      </header>
      <MasterGoReconstructionTaskState task={task} sourceDataUrl={sourceImage} />
      <footer className="flex justify-end border-t px-6 py-4"><Button variant="outline">取消任务</Button></footer>
      {!auto ? <nav className="flex flex-wrap gap-1 border-t bg-muted/30 px-6 py-3" aria-label="预览阶段">
        {frames.map((item, index) => <button
          key={`${item.stage}-${item.progress}`}
          type="button"
          className={`rounded-md px-2 py-1 text-xs ${frameIndex === index ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
          onClick={() => setFrameIndex(index)}
        >
          {item.progress}%
        </button>)}
      </nav> : null}
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
