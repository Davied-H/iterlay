import { useUiText } from "@/i18n";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  BoxSelect,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Download,
  FileImage,
  FolderKanban,
  GitCompareArrows,
  History,
  ImagePlus,
  LayoutGrid,
  Layers3,
  MessageSquareText,
  MousePointer2,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Star,
  WandSparkles
} from "lucide-react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const WELCOME_DEMO_FPS = 30;
export const WELCOME_DEMO_FEATURE_FRAMES = 120;
export const WELCOME_DEMO_TRANSITION_FRAMES = 12;
export const WELCOME_DEMO_FEATURES_PER_SCENE = 3;
export const WELCOME_DEMO_SCENE_COUNT = 3;
export const WELCOME_MORE_DEMO_SCENE_COUNT = 6;
export const WELCOME_DEMO_FEATURE_COUNT = WELCOME_DEMO_SCENE_COUNT * WELCOME_DEMO_FEATURES_PER_SCENE;
export const WELCOME_DEMO_SCENE_FRAMES = WELCOME_DEMO_FEATURE_FRAMES * WELCOME_DEMO_FEATURES_PER_SCENE;
export const WELCOME_DEMO_SCENE_STEP_FRAMES = WELCOME_DEMO_SCENE_FRAMES - WELCOME_DEMO_TRANSITION_FRAMES;
export const welcomeDemoDuration = (sceneCount: number): number =>
  WELCOME_DEMO_SCENE_FRAMES + WELCOME_DEMO_SCENE_STEP_FRAMES * (sceneCount - 1);
export const WELCOME_DEMO_DURATION = welcomeDemoDuration(WELCOME_DEMO_SCENE_COUNT);
export const WELCOME_MORE_DEMO_DURATION = welcomeDemoDuration(WELCOME_MORE_DEMO_SCENE_COUNT);
export const WELCOME_DEMO_WIDTH = 960;
export const WELCOME_DEMO_HEIGHT = 720;

export type WelcomeDemoMode = "core" | "more";

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const INK = "#18181b";
const MUTED = "#71717a";
const ACCENT = "#356dcc";
const FEATURE_2 = WELCOME_DEMO_FEATURE_FRAMES;
const FEATURE_3 = WELCOME_DEMO_FEATURE_FRAMES * 2;

export interface WelcomeDemoAssets {
  assistantBefore: string;
  assistantAfter: string;
  parallelResults: [string, string, string];
  referenceSource: string;
  referenceResult: string;
  compareBefore: string;
  compareAfter: string;
  sliceSource: string;
}

export interface WelcomeDemoReelProps {
  assets: WelcomeDemoAssets;
  mode: WelcomeDemoMode;
}

interface SceneProps {
  assets: WelcomeDemoAssets;
  fadeIn?: boolean;
  fadeOut?: boolean;
}

function progress(frame: number, from = 0, to = from + 20): number {
  return interpolate(frame, [from, to], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
}

function springIn(frame: number, fps: number, delay = 0): number {
  return spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 140, mass: 0.76 } });
}

function sceneOpacity(frame: number, fadeIn: boolean, fadeOut: boolean): number {
  const enter = fadeIn ? progress(frame, 0, WELCOME_DEMO_TRANSITION_FRAMES - 1) : 1;
  const exit = fadeOut
    ? 1 - progress(
        frame,
        WELCOME_DEMO_SCENE_FRAMES - WELCOME_DEMO_TRANSITION_FRAMES,
        WELCOME_DEMO_SCENE_FRAMES - 1
      )
    : 1;
  return Math.min(enter, exit);
}

function DemoShell({
  children,
  fadeIn = true,
  fadeOut = true
}: {
  children: ReactNode;
  fadeIn?: boolean;
  fadeOut?: boolean;
}): React.ReactElement {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity(frame, fadeIn, fadeOut),
        overflow: "hidden",
        color: INK,
        background: "#e9e9e7",
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      }}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", backgroundColor: "#e9e9e7", backgroundImage: "radial-gradient(circle, rgb(24 24 27 / 0.16) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
        <div style={{ position: "absolute", inset: "28px 0" }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
}

const imageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover"
};

function AiAssistantScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scan = progress(frame, 12, 82);
  const contextExit = 1 - progress(frame, FEATURE_2 - 14, FEATURE_2 + 16);
  const editIn = progress(frame, FEATURE_2 - 8, FEATURE_2 + 22);
  const applied = progress(frame, FEATURE_2 + 42, FEATURE_2 + 94);
  const receiptIn = springIn(frame, fps, FEATURE_3 + 18);
  const prompt = "保留产品比例，收紧构图，降低背景饱和度";
  const promptLength = Math.floor(interpolate(frame, [FEATURE_2 + 10, FEATURE_2 + 58], [0, prompt.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", left: 50, top: 44, width: 548, height: 500, overflow: "hidden", borderRadius: 9, background: "#d6d6d3", boxShadow: "0 8px 22px rgb(24 24 27 / 0.16)" }}>
        <img src={assets.assistantBefore} alt="" style={imageStyle} />
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - applied * 100}% 0 0)` }}><img src={assets.assistantAfter} alt="" style={imageStyle} /></div>
        <div style={{ position: "absolute", inset: 14, border: "2px solid #78a4ff", borderRadius: 7, opacity: contextExit * springIn(frame, fps, 16) }}>
          <span style={{ position: "absolute", right: 0, left: 0, top: `${scan * 100}%`, height: 2, background: "#78a4ff", boxShadow: "0 0 14px 3px rgb(120 164 255 / 0.45)" }} />
        </div>
        <span style={{ position: "absolute", right: 16, bottom: 16, display: "flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 10px", opacity: receiptIn, color: "#091b3f", background: "#78a4ff", fontSize: 11, fontWeight: 700 }}><Check size={13} />{uiText("修改已应用")}</span>
      </div>

      <div style={{ position: "absolute", right: 44, top: 64, width: 282, height: 450, overflow: "hidden", borderRadius: 10, background: "#fbfbf9", boxShadow: "0 8px 24px rgb(24 24 27 / 0.18)" }}>
        <div style={{ display: "flex", height: 50, alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e1e1de", padding: "0 15px", fontSize: 13, fontWeight: 700 }}><span>{uiText("画板共创助手")}</span><span style={{ color: MUTED, fontSize: 10, fontWeight: 500 }}>{uiText("基于当前画面")}</span></div>

        <div style={{ position: "absolute", inset: "50px 0 0", padding: 18, opacity: contextExit, transform: `translateX(${(1 - contextExit) * -18}px)` }}>
          <div style={{ marginBottom: 14, fontSize: 12, fontWeight: 700 }}>{uiText("正在读取创作上下文")}</div>
          {["画布 · 4 件作品", "选中 · 电商主视觉", "意图 · 收紧构图和配色"].map((item, index) => {
            const itemIn = springIn(frame, fps, 26 + index * 16);
            return <div key={item} style={{ display: "flex", height: 62, alignItems: "center", gap: 10, marginTop: 9, borderRadius: 8, padding: "0 11px", opacity: itemIn, background: "#eeeeeb", fontSize: 11, transform: `translateX(${(1 - itemIn) * 14}px)` }}><CircleCheck size={14} color={ACCENT} />{item}</div>;
          })}
        </div>

        <div style={{ position: "absolute", inset: "50px 0 0", display: "flex", flexDirection: "column", gap: 12, padding: 16, opacity: editIn, transform: `translateX(${(1 - editIn) * 18}px)` }}>
          <div style={{ alignSelf: "flex-end", maxWidth: "84%", borderRadius: 8, padding: "9px 10px", background: "#e8e8e4", fontSize: 11, lineHeight: 1.5 }}>{uiText("做一版更克制的电商主视觉")}</div>
          <div style={{ minHeight: 62, borderRadius: 8, padding: "9px 10px", background: "#f0f0ed", fontSize: 11, lineHeight: 1.55 }}>{prompt.slice(0, promptLength)}{promptLength < prompt.length ? <span style={{ color: ACCENT }}>|</span> : null}</div>
          <div style={{ display: "flex", minHeight: 44, alignItems: "center", gap: 7, border: "1px solid #dededa", borderRadius: 8, padding: "0 9px", opacity: receiptIn, color: MUTED, fontSize: 10 }}><Check size={12} color={ACCENT} /><span style={{ flex: 1 }}>{uiText("提示词与参考设置已更新")}</span><span style={{ display: "flex", alignItems: "center", gap: 4, color: INK, fontWeight: 650 }}><RotateCcw size={11} />{uiText("撤销")}</span></div>
          <div style={{ display: "flex", height: 48, alignItems: "center", gap: 8, marginTop: "auto", border: "1px solid #dededa", borderRadius: 8, padding: "0 9px", color: MUTED, fontSize: 10 }}><span style={{ flex: 1 }}>{uiText("继续描述你的想法")}</span><span style={{ display: "grid", width: 29, height: 29, placeItems: "center", borderRadius: 7, color: "#fff", background: INK }}><Send size={12} /></span></div>
        </div>
      </div>
    </DemoShell>
  );
}

function ParallelExplorationScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const branch = progress(frame, 20, 62);
  const compareIn = progress(frame, FEATURE_3 - 12, FEATURE_3 + 20);
  const completionFrames = [FEATURE_2 + 80, FEATURE_2 + 48, FEATURE_2 + 96];

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", top: 24 - progress(frame, FEATURE_2 - 12, FEATURE_2 + 22) * 18, left: "50%", width: 430, padding: "14px 17px", borderRadius: 9, opacity: 1 - compareIn * 0.55, background: "#fff", transform: `translateX(-50%) scale(${1 - compareIn * 0.06})`, boxShadow: "0 7px 18px rgb(24 24 27 / 0.14)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTED, fontSize: 10 }}><Sparkles size={13} color={ACCENT} />{uiText("同一产品，探索三种视觉方向")}</div>
        <div style={{ marginTop: 5, fontSize: 13, fontWeight: 650 }}>{uiText("保留主体比例，分别尝试不同视觉语言")}</div>
      </div>
      <div style={{ position: "absolute", top: 111, left: "50%", width: 2, height: 44, opacity: 1 - compareIn, background: ACCENT, transform: `translateX(-50%) scaleY(${branch})`, transformOrigin: "top" }} />
      <div style={{ position: "absolute", top: 153, left: 176, width: 608, height: 2, opacity: 1 - compareIn, background: ACCENT, transform: `scaleX(${branch})`, transformOrigin: "center" }} />

      {assets.parallelResults.map((asset, index) => {
        const cardIn = springIn(frame, fps, 42 + index * 10);
        const taskProgress = interpolate(frame, [FEATURE_2 + 8 + index * 4, completionFrames[index]], [6, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const done = progress(frame, completionFrames[index] - 4, completionFrames[index] + 10);
        const selected = index === 1 ? progress(frame, FEATURE_3 + 56, FEATURE_3 + 78) : 0;
        return (
          <div key={asset} style={{ position: "absolute", left: 72 + index * 280, top: 176 - compareIn * 32, width: 256, height: 344 + compareIn * 76, overflow: "hidden", borderRadius: 9, opacity: cardIn, outline: selected ? "3px solid #78a4ff" : "none", background: "#fbfbf9", transform: `translateY(${(1 - cardIn) * 18}px)`, boxShadow: "0 7px 18px rgb(24 24 27 / 0.15)" }}>
            <div style={{ position: "absolute", inset: "0 0 88px", overflow: "hidden", background: "#d7d7d4" }}>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: 1 - done }}><div style={{ width: 142, textAlign: "center", color: MUTED, fontSize: 10 }}><Clock3 size={18} style={{ margin: "0 auto 10px" }} />{uiText("方向 ")}{String.fromCharCode(65 + index)} {uiText("已入队")}</div></div>
              <img src={asset} alt="" style={{ ...imageStyle, opacity: done, transform: `scale(${0.96 + done * 0.04})` }} />
            </div>
            <div style={{ position: "absolute", right: 12, bottom: 12, left: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 650 }}><span>{uiText("方向 ")}{String.fromCharCode(65 + index)}</span><span style={{ color: done > 0.9 ? ACCENT : MUTED, fontSize: 9 }}>{done > 0.9 ? uiText("已完成") : `${Math.round(taskProgress)}%`}</span></div>
              <div style={{ height: 4, marginTop: 10, overflow: "hidden", borderRadius: 99, background: "#e1e1dd" }}><div style={{ width: `${taskProgress}%`, height: "100%", borderRadius: 99, background: done > 0.9 ? ACCENT : MUTED }} /></div>
            </div>
            {selected ? <span style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5, borderRadius: 6, padding: "5px 8px", color: "#091b3f", background: "#78a4ff", fontSize: 9, fontWeight: 700 }}><Check size={11} />{uiText("更接近目标")}</span> : null}
          </div>
        );
      })}

      <div style={{ position: "absolute", right: 150, bottom: 16, left: 150, display: "flex", height: 50, alignItems: "center", justifyContent: "space-between", borderRadius: 9, padding: "0 14px", opacity: compareIn, background: "#fff", fontSize: 10, boxShadow: "0 6px 16px rgb(24 24 27 / 0.14)" }}><span style={{ color: MUTED }}>{uiText("构图 · 材质 · 光线集中比较")}</span><span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>{uiText("采用方向 B ")}<ArrowRight size={12} /></span></div>
    </DemoShell>
  );
}

function ReferenceGenerationScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const selected = springIn(frame, fps, 22);
  const intentIn = progress(frame, FEATURE_2 - 8, FEATURE_2 + 24);
  const branch = progress(frame, FEATURE_3 + 18, FEATURE_3 + 72);
  const resultIn = springIn(frame, fps, FEATURE_3 + 42);
  const fly = progress(frame, FEATURE_2 + 10, FEATURE_2 + 72);

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", left: 58, top: 58, width: 300 - intentIn * 36, height: 430 - intentIn * 40, overflow: "hidden", borderRadius: 9, outline: `${selected * (1 - intentIn) * 3}px solid #78a4ff`, opacity: 1 - branch * 0.28, boxShadow: "0 8px 22px rgb(24 24 27 / 0.18)" }}>
        <img src={assets.referenceSource} alt="" style={imageStyle} />
        <span style={{ position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 10px", opacity: selected * (1 - intentIn), color: "#091b3f", background: "#78a4ff", fontSize: 10, fontWeight: 700 }}><ImagePlus size={12} />{uiText("用作参考")}</span>
        <span style={{ position: "absolute", top: 12, left: 12, borderRadius: 6, padding: "5px 8px", opacity: intentIn, color: "#091b3f", background: "#78a4ff", fontSize: 9, fontWeight: 700 }}>{uiText("参考图")}</span>
      </div>

      <div style={{ position: "absolute", right: 58, top: 58, width: 520, minHeight: 390, borderRadius: 10, padding: 22, opacity: intentIn * (1 - branch * 0.35), background: "#fbfbf9", transform: `translateX(${(1 - intentIn) * 24}px)`, boxShadow: "0 8px 22px rgb(24 24 27 / 0.16)" }}>
        <div style={{ color: MUTED, fontSize: 10 }}>{uiText("参考关系")}</div><div style={{ marginTop: 7, fontSize: 14, fontWeight: 700 }}>{uiText("说明什么保留，什么改变")}</div>
        {[{ label: "保留", values: ["主体轮廓", "镜头角度", "构图比例"] }, { label: "改变", values: ["夜景氛围", "冷色光线", "电影颗粒"] }].map((group, groupIndex) => <div key={group.label} style={{ marginTop: 24 }}><div style={{ color: groupIndex === 0 ? ACCENT : MUTED, fontSize: 10, fontWeight: 700 }}>{group.label}</div><div style={{ display: "flex", gap: 7, marginTop: 9 }}>{group.values.map((value, index) => <span key={value} style={{ borderRadius: 7, padding: "7px 9px", opacity: springIn(frame, fps, FEATURE_2 + 18 + groupIndex * 24 + index * 7), background: groupIndex === 0 ? "rgb(53 109 204 / 0.11)" : "#e9e9e6", fontSize: 10 }}>{value}</span>)}</div></div>)}
        <div style={{ display: "flex", height: 48, alignItems: "center", gap: 8, marginTop: 28, border: "1px solid #dededa", borderRadius: 8, padding: "0 10px", color: MUTED, fontSize: 10 }}><span style={{ flex: 1 }}>{uiText("增加雨后路面的反光")}</span><span style={{ display: "grid", width: 30, height: 30, placeItems: "center", borderRadius: 7, color: "#fff", background: INK }}><Send size={12} /></span></div>
      </div>

      <div style={{ position: "absolute", zIndex: 4, left: 222 + fly * 270, top: 360 + fly * 98 - Math.sin(Math.PI * fly) * 74, width: 64 - fly * 20, height: 64 - fly * 20, overflow: "hidden", borderRadius: 7, opacity: interpolate(fly, [0, 0.1, 0.9, 1], [0, 1, 1, 0]), transform: `rotate(${interpolate(fly, [0, 1], [-5, 3])}deg)`, boxShadow: "0 7px 16px rgb(24 24 27 / 0.2)" }}><img src={assets.referenceSource} alt="" style={imageStyle} /></div>

      <div style={{ position: "absolute", left: 326, top: 264, width: 218, height: 2, opacity: branch, background: ACCENT, transform: `scaleX(${branch})`, transformOrigin: "left" }} />
      <div style={{ position: "absolute", right: 72, top: 74, width: 310, height: 390, overflow: "hidden", borderRadius: 9, opacity: resultIn * branch, transform: `translateX(${(1 - resultIn) * 22}px)`, boxShadow: "0 9px 24px rgb(24 24 27 / 0.2)" }}><img src={assets.referenceResult} alt="" style={imageStyle} /><span style={{ position: "absolute", right: 10, bottom: 10, borderRadius: 6, padding: "5px 8px", color: "#091b3f", background: "#78a4ff", fontSize: 9, fontWeight: 700 }}>{uiText("新分支 · 夜景")}</span></div>
      <div style={{ position: "absolute", right: 110, bottom: 26, display: "flex", width: 232, alignItems: "center", justifyContent: "space-between", borderRadius: 8, padding: "10px 12px", opacity: branch, background: "#fff", color: MUTED, fontSize: 9 }}><span>{uiText("关系已保留在画布")}</span><ArrowRight size={12} color={INK} /></div>
    </DemoShell>
  );
}

function VersionCompareScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const compareIn = progress(frame, FEATURE_2 - 12, FEATURE_2 + 26);
  const selectedIn = springIn(frame, fps, FEATURE_3 + 28);
  const slider = compareIn * interpolate(frame, [FEATURE_2 + 18, FEATURE_2 + 66, FEATURE_3 - 12], [26, 74, 46], { easing: EASE_OUT, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) + (1 - compareIn) * 26;

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      {[2, 1].map((offset) => {
        const stackIn = springIn(frame, fps, 16 + offset * 14);
        return <div key={offset} style={{ position: "absolute", inset: `${50 + offset * 8}px ${126 - offset * 8}px ${42 - offset * 8}px ${126 + offset * 8}px`, borderRadius: 10, opacity: stackIn * (1 - compareIn) * 0.52, background: offset === 2 ? "#a1a1aa" : "#d4d4d8", transform: `translateY(${(1 - stackIn) * 22}px)` }} />;
      })}
      <div style={{ position: "absolute", inset: "46px 126px 40px", overflow: "hidden", borderRadius: 10, background: "#d7d7d5", boxShadow: "0 9px 26px rgb(24 24 27 / 0.18)", transform: `translateX(${-selectedIn * 92}px) scale(${1 - selectedIn * 0.08})`, transformOrigin: "left center" }}>
        <img src={assets.compareBefore} alt="" style={imageStyle} />
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: `inset(0 ${100 - slider}% 0 0)` }}><img src={assets.compareAfter} alt="" style={imageStyle} /></div>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${slider}%`, width: 2, opacity: compareIn, background: "#fff", boxShadow: "0 0 0 1px rgb(24 24 27 / 0.2)" }}><span style={{ position: "absolute", top: "50%", left: "50%", display: "grid", width: 40, height: 40, placeItems: "center", borderRadius: 99, background: "#fff", transform: "translate(-50%, -50%)", boxShadow: "0 4px 12px rgb(24 24 27 / 0.2)" }}><GitCompareArrows size={17} /></span></div>
        <span style={{ position: "absolute", top: 14, left: 14, borderRadius: 6, padding: "5px 8px", color: "#fff", background: "rgb(24 24 27 / 0.78)", fontSize: 9 }}>V3</span>
        <span style={{ position: "absolute", top: 14, right: 14, borderRadius: 6, padding: "5px 8px", opacity: compareIn, color: "#fff", background: "rgb(24 24 27 / 0.78)", fontSize: 9 }}>V1</span>
        <span style={{ position: "absolute", left: "50%", bottom: 14, display: "flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 10px", opacity: selectedIn, color: "#091b3f", background: "#78a4ff", fontSize: 10, fontWeight: 700, transform: "translateX(-50%)" }}><Check size={12} />{uiText("采用 V3")}</span>
      </div>

      <div style={{ position: "absolute", right: 38, top: 86, width: 260, borderRadius: 10, padding: 18, opacity: selectedIn, background: "#fbfbf9", transform: `translateX(${(1 - selectedIn) * 18}px)`, boxShadow: "0 8px 22px rgb(24 24 27 / 0.16)" }}>
        <div style={{ color: MUTED, fontSize: 9 }}>{uiText("从 V3 继续")}</div><div style={{ marginTop: 7, fontSize: 13, fontWeight: 700 }}>{uiText("下一步要调整什么？")}</div>
        {["替换标题排版", "延展横版尺寸", "生成同系列副图"].map((item, index) => <div key={item} style={{ display: "flex", height: 44, alignItems: "center", justifyContent: "space-between", marginTop: 8, borderRadius: 8, padding: "0 10px", background: index === 2 ? "rgb(53 109 204 / 0.12)" : "#ecece9", fontSize: 10 }}><span>{item}</span><ArrowRight size={11} color={index === 2 ? ACCENT : MUTED} /></div>)}
        <div style={{ display: "flex", height: 38, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, borderRadius: 8, color: "#fff", background: INK, fontSize: 10, fontWeight: 650 }}><Sparkles size={12} />{uiText("继续生成")}</div>
      </div>
      <div style={{ position: "absolute", right: 28, bottom: 18, display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 10 }}><Layers3 size={13} />{uiText("3 个版本自动保留")}</div>
    </DemoShell>
  );
}

const slices = [
  { x: 0, y: 0, position: "0% 0%" },
  { x: 1, y: 0, position: "100% 0%" },
  { x: 0, y: 1, position: "0% 100%" },
  { x: 1, y: 1, position: "100% 100%" }
];

function SliceExportScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scan = progress(frame, 12, 90);
  const splitIn = progress(frame, FEATURE_2 - 10, FEATURE_2 + 18);
  const exportIn = progress(frame, FEATURE_3 - 8, FEATURE_3 + 24);
  const packed = progress(frame, FEATURE_3 + 46, FEATURE_3 + 96);

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", left: 56 - exportIn * 18, top: 48, width: 390 - exportIn * 46, height: 480 - exportIn * 52, overflow: "hidden", borderRadius: 9, opacity: 1 - exportIn * 0.35, boxShadow: "0 8px 22px rgb(24 24 27 / 0.18)" }}>
        <img src={assets.sliceSource} alt="" style={imageStyle} />
        <div style={{ position: "absolute", right: 0, left: 0, top: `${scan * 100}%`, height: 2, opacity: scan < 1 && splitIn < 0.2 ? 1 : 0, background: "#78a4ff", boxShadow: "0 0 16px 4px rgb(120 164 255 / 0.45)" }} />
        {slices.map((slice, index) => <div key={slice.position} style={{ position: "absolute", left: 12 + slice.x * 183, top: 12 + slice.y * 224, width: 171, height: 212, border: "2px solid #78a4ff", borderRadius: 6, opacity: springIn(frame, fps, 42 + index * 12) * (1 - splitIn) }}><span style={{ position: "absolute", top: 5, left: 5, borderRadius: 5, padding: "4px 6px", color: "#091b3f", background: "#78a4ff", fontSize: 8, fontWeight: 700 }}>{uiText("区域 ")}{index + 1}</span></div>)}
      </div>

      <div style={{ position: "absolute", right: 50, top: 42, display: "grid", width: 470, gridTemplateColumns: "repeat(2, 1fr)", gap: 12, opacity: splitIn * (1 - exportIn * 0.35) }}>
        {slices.map((slice, index) => {
          const tileIn = springIn(frame, fps, FEATURE_2 + 10 + index * 12);
          const startX = -360 + slice.x * 120;
          const startY = 176 + slice.y * 72;
          return <div key={slice.position} style={{ position: "relative", height: 210, overflow: "hidden", borderRadius: 8, opacity: tileIn, outline: index === 2 ? "3px solid #78a4ff" : "none", backgroundImage: `url(${assets.sliceSource})`, backgroundPosition: slice.position, backgroundSize: "200% 200%", transform: `translate(${(1 - tileIn) * startX}px, ${(1 - tileIn) * startY}px) scale(${0.72 + tileIn * 0.28})`, boxShadow: "0 6px 16px rgb(24 24 27 / 0.14)" }}><span style={{ position: "absolute", right: 8, bottom: 8, borderRadius: 5, padding: "4px 6px", color: "#fff", background: "rgb(24 24 27 / 0.75)", fontSize: 8 }}>{uiText("切片 ")}{index + 1}</span>{index === 2 ? <span style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 4, borderRadius: 5, padding: "4px 6px", color: "#091b3f", background: "#78a4ff", fontSize: 8, fontWeight: 700 }}><Check size={9} />{uiText("范围已校正")}</span> : null}</div>;
        })}
      </div>

      <div style={{ position: "absolute", right: 56, top: 92, width: 286, borderRadius: 10, padding: 22, opacity: exportIn, background: "#fbfbf9", transform: `translateX(${(1 - exportIn) * 18}px)`, boxShadow: "0 8px 22px rgb(24 24 27 / 0.17)" }}>
        <div style={{ display: "grid", width: 46, height: 46, placeItems: "center", borderRadius: 9, color: "#091b3f", background: "#78a4ff" }}><Download size={20} /></div><div style={{ marginTop: 18, fontSize: 15, fontWeight: 700 }}>{uiText("4 个素材已就绪")}</div><div style={{ marginTop: 8, color: MUTED, fontSize: 10, lineHeight: 1.6 }}>{uiText("保留原图、透明切片与画布关系")}</div>
        <div style={{ marginTop: 18 }}>
          {slices.map((slice, index) => <div key={slice.position} style={{ display: "flex", height: 34, alignItems: "center", gap: 7, opacity: springIn(frame, fps, FEATURE_3 + 14 + index * 8) * (1 - packed * 0.55), color: MUTED, fontSize: 9, transform: `translateY(${packed * (74 - index * 10)}px) scale(${1 - packed * 0.16})` }}><FileImage size={11} color={ACCENT} />slice-{index + 1}.png<CircleCheck size={11} style={{ marginLeft: "auto" }} /></div>)}
        </div>
        <div style={{ display: "flex", height: 40, alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14, borderRadius: 8, color: "#fff", background: INK, fontSize: 10, fontWeight: 650 }}><Download size={12} />{uiText("导出全部")}</div>
      </div>
      <div style={{ position: "absolute", left: 108, bottom: 18, display: "flex", alignItems: "center", gap: 7, opacity: splitIn * (1 - exportIn), color: MUTED, fontSize: 9 }}><SlidersHorizontal size={12} />{uiText("拖动边界可微调范围")}</div>
    </DemoShell>
  );
}

function CanvasWorkspaceScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const selectionIn = progress(frame, FEATURE_2 - 8, FEATURE_2 + 28);
  const organizeIn = progress(frame, FEATURE_3 - 10, FEATURE_3 + 34);
  const cards = [
    { asset: assets.parallelResults[0], x: 84, y: 70, w: 224, h: 286, rotate: -2 },
    { asset: assets.parallelResults[1], x: 360, y: 118, w: 244, h: 310, rotate: 1 },
    { asset: assets.referenceResult, x: 650, y: 58, w: 224, h: 286, rotate: 2 }
  ];

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", inset: "18px 30px 20px", overflow: "hidden", borderRadius: 10, background: "#dededb", boxShadow: "0 8px 24px rgb(24 24 27 / 0.15)" }}>
        <div style={{ position: "absolute", top: 14, right: 16, left: 16, display: "flex", alignItems: "center", justifyContent: "space-between", color: MUTED, fontSize: 9 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><FolderKanban size={12} />{uiText("品牌春季提案 · 自动保存")}</span>
          <span>68%</span>
        </div>
        {cards.map((card, index) => {
          const cardIn = springIn(frame, fps, 16 + index * 14);
          const selected = index < 2 ? selectionIn : 0;
          return (
            <div key={card.asset} style={{ position: "absolute", left: card.x + organizeIn * (index === 0 ? 54 : index === 1 ? -18 : -72), top: card.y + organizeIn * (index === 1 ? -28 : 36), width: card.w, height: card.h, overflow: "hidden", borderRadius: 8, opacity: cardIn, outline: selected ? "3px solid #78a4ff" : "none", background: "#c8c8c5", transform: `translateY(${(1 - cardIn) * 28}px) rotate(${card.rotate * (1 - organizeIn)}deg)`, boxShadow: "0 7px 18px rgb(24 24 27 / 0.16)" }}>
              <img src={card.asset} alt="" style={imageStyle} />
              {selected ? <span style={{ position: "absolute", top: 8, left: 8, display: "grid", width: 18, height: 18, placeItems: "center", borderRadius: 5, color: "#091b3f", background: "#78a4ff" }}><Check size={11} /></span> : null}
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 64, top: 48, width: 560, height: 402, border: "2px solid #356dcc", borderRadius: 7, opacity: selectionIn * (1 - organizeIn), transform: `scale(${0.96 + selectionIn * 0.04})`, transformOrigin: "top left" }}>
          <span style={{ position: "absolute", top: -30, left: 0, display: "flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "6px 9px", color: "#091b3f", background: "#78a4ff", fontSize: 9, fontWeight: 700 }}><BoxSelect size={11} />{uiText("已选择 2 件作品")}</span>
        </div>
        <div style={{ position: "absolute", right: 30, bottom: 22, display: "flex", alignItems: "center", gap: 8, borderRadius: 8, padding: "9px 12px", opacity: organizeIn, color: MUTED, background: "#fbfbf9", fontSize: 9, boxShadow: "0 6px 16px rgb(24 24 27 / 0.14)" }}><MousePointer2 size={12} color={ACCENT} />{uiText("批量移动后，空间关系仍然保留")}</div>
      </div>
    </DemoShell>
  );
}

function TemplateCopilotScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fieldsIn = progress(frame, FEATURE_2 - 8, FEATURE_2 + 24);
  const optimizeIn = progress(frame, FEATURE_3 - 10, FEATURE_3 + 28);
  const templates = ["电商主视觉", "概念场景", "叙事插画"];
  const fields = ["主体 · 便携小夜灯", "材质 · 磨砂玻璃", "光线 · 柔和暖光"];

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", left: 46, top: 42, width: 300, height: 470, borderRadius: 10, padding: 18, background: "#fbfbf9", boxShadow: "0 8px 22px rgb(24 24 27 / 0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: MUTED, fontSize: 10 }}><LayoutGrid size={13} />{uiText("场景模板")}</div>
        {templates.map((template, index) => {
          const itemIn = springIn(frame, fps, 16 + index * 13);
          return <div key={template} style={{ display: "flex", height: 74, alignItems: "center", gap: 11, marginTop: 12, borderRadius: 8, padding: "0 12px", opacity: itemIn, outline: index === 0 ? "2px solid #78a4ff" : "none", background: index === 0 ? "rgb(53 109 204 / 0.1)" : "#eeeeeb", transform: `translateX(${(1 - itemIn) * 16}px)`, fontSize: 11, fontWeight: 650 }}><span style={{ display: "grid", width: 34, height: 34, placeItems: "center", borderRadius: 7, color: index === 0 ? "#091b3f" : MUTED, background: index === 0 ? "#78a4ff" : "#dfdfdc" }}><Sparkles size={15} /></span>{template}{index === 0 ? <Check size={13} style={{ marginLeft: "auto" }} color={ACCENT} /> : null}</div>;
        })}
      </div>
      <div style={{ position: "absolute", right: 46, top: 42, width: 520, height: 470, overflow: "hidden", borderRadius: 10, background: "#fbfbf9", boxShadow: "0 8px 22px rgb(24 24 27 / 0.16)" }}>
        <div style={{ display: "flex", height: 52, alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e3e3df", padding: "0 16px", fontSize: 11, fontWeight: 700 }}><span>{uiText("电商主视觉")}</span><span style={{ color: MUTED, fontSize: 9, fontWeight: 500 }}>{uiText("只填决定画面的信息")}</span></div>
        <div style={{ padding: 18, opacity: fieldsIn * (1 - optimizeIn * 0.4) }}>
          {fields.map((field, index) => <div key={field} style={{ display: "flex", height: 52, alignItems: "center", marginTop: index ? 10 : 0, borderRadius: 8, padding: "0 12px", opacity: springIn(frame, fps, FEATURE_2 + index * 12), background: "#eeeeeb", color: index === 0 ? INK : MUTED, fontSize: 10 }}><Check size={12} color={ACCENT} style={{ marginRight: 8 }} />{field}</div>)}
        </div>
        <div style={{ position: "absolute", inset: "62px 18px 18px", borderRadius: 9, padding: 16, opacity: optimizeIn, background: "#eeeeeb", transform: `translateY(${(1 - optimizeIn) * 18}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: ACCENT, fontSize: 10, fontWeight: 700 }}><WandSparkles size={13} />{uiText("AI 已补全可执行提示词")}</div>
          <div style={{ marginTop: 14, color: INK, fontSize: 11, lineHeight: 1.8 }}>{uiText("一盏磨砂玻璃便携小夜灯，拉丝金属底座，暖光微亮，鼠尾草绿纯色背景，克制的产品摄影。")}</div>
          <div style={{ position: "absolute", right: 14, bottom: 14, display: "flex", height: 36, alignItems: "center", gap: 6, borderRadius: 7, padding: "0 11px", color: "#fff", background: INK, fontSize: 9, fontWeight: 650 }}>{uiText("采用并生成 ")}<ArrowRight size={11} /></div>
        </div>
        <div style={{ position: "absolute", right: 20, bottom: 20, width: 108, height: 108, overflow: "hidden", borderRadius: 8, opacity: optimizeIn, transform: `scale(${0.9 + optimizeIn * 0.1})` }}><img src={assets.assistantAfter} alt="" style={imageStyle} /></div>
      </div>
    </DemoShell>
  );
}

function HistoryCommentScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reuseIn = progress(frame, FEATURE_2 - 10, FEATURE_2 + 26);
  const commentsIn = progress(frame, FEATURE_3 - 10, FEATURE_3 + 26);

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", left: 38, top: 36, width: 320, height: 486, borderRadius: 10, padding: 16, background: "#fbfbf9", boxShadow: "0 8px 22px rgb(24 24 27 / 0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700 }}><History size={14} />{uiText("生成历史")}</div>
        {["今天 · 14:32", "今天 · 14:18", "昨天 · 18:46"].map((time, index) => {
          const itemIn = springIn(frame, fps, 18 + index * 13);
          return <div key={time} style={{ display: "flex", height: 92, alignItems: "center", gap: 10, marginTop: 12, borderRadius: 8, padding: 9, opacity: itemIn, outline: index === 0 ? "2px solid #78a4ff" : "none", background: "#eeeeeb", transform: `translateY(${(1 - itemIn) * 12}px)` }}><img src={assets.parallelResults[index]} alt="" style={{ width: 68, height: 72, borderRadius: 6, objectFit: "cover" }} /><span style={{ flex: 1, fontSize: 9, lineHeight: 1.55 }}><strong style={{ display: "block", marginBottom: 5, fontSize: 10 }}>{time}</strong>{index === 0 ? uiText("克制的电商主视觉") : index === 1 ? uiText("三种材质方向") : uiText("暖光产品摄影")}</span></div>;
        })}
      </div>
      <div style={{ position: "absolute", right: 42, top: 52, width: 520, height: 442, overflow: "hidden", borderRadius: 10, background: "#d3d3d0", boxShadow: "0 8px 22px rgb(24 24 27 / 0.17)" }}>
        <img src={assets.assistantAfter} alt="" style={imageStyle} />
        <div style={{ position: "absolute", right: 14, left: 14, bottom: 14, minHeight: 70, borderRadius: 8, padding: "11px 12px", opacity: reuseIn * (1 - commentsIn), background: "rgb(251 251 249 / 0.94)", fontSize: 9, boxShadow: "0 5px 14px rgb(24 24 27 / 0.16)" }}><span style={{ display: "flex", alignItems: "center", gap: 6, color: ACCENT, fontWeight: 700 }}><RotateCcw size={11} />{uiText("参数已回填")}</span><span style={{ display: "block", marginTop: 7, color: MUTED }}>{uiText("提示词、尺寸与参考图已恢复，可以直接继续生成")}</span></div>
        {[{ x: 62, y: 88, label: "光线再柔和一些" }, { x: 360, y: 204, label: "保留这个材质" }].map((comment, index) => {
          const pinIn = springIn(frame, fps, FEATURE_3 + 16 + index * 18);
          return <div key={comment.label} style={{ position: "absolute", left: comment.x, top: comment.y, opacity: commentsIn * pinIn }}><span style={{ display: "grid", width: 24, height: 24, placeItems: "center", borderRadius: 99, color: "#091b3f", background: "#78a4ff", fontSize: 9, fontWeight: 800 }}>{index + 1}</span><span style={{ position: "absolute", top: 30, left: 4, width: 132, borderRadius: 7, padding: "7px 8px", background: "#fbfbf9", color: INK, fontSize: 8, boxShadow: "0 5px 12px rgb(24 24 27 / 0.18)" }}>{comment.label}</span></div>;
        })}
      </div>
      <div style={{ position: "absolute", right: 50, bottom: 14, display: "flex", alignItems: "center", gap: 6, opacity: commentsIn, color: MUTED, fontSize: 9 }}><MessageSquareText size={12} color={ACCENT} />{uiText("评论跟随作品持久保留")}</div>
    </DemoShell>
  );
}

function LibraryGalleryScene({ assets, fadeIn, fadeOut }: SceneProps): React.ReactElement {
  const uiText = useUiText();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const boardIn = progress(frame, FEATURE_2 - 8, FEATURE_2 + 28);
  const galleryIn = progress(frame, FEATURE_3 - 10, FEATURE_3 + 30);
  const galleryAssets = [...assets.parallelResults, assets.referenceResult, assets.compareAfter, assets.sliceSource];

  return (
    <DemoShell fadeIn={fadeIn} fadeOut={fadeOut}>
      <div style={{ position: "absolute", inset: "30px 34px", overflow: "hidden", borderRadius: 10, background: "#f5f5f2", boxShadow: "0 8px 24px rgb(24 24 27 / 0.16)" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 150, padding: "18px 14px", background: "#252a33", color: "#fafafa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700 }}><FolderKanban size={14} />Iterlay</div>
          {["画板", "素材库", "模版库", "生成画廊"].map((item, index) => <div key={item} style={{ display: "flex", height: 38, alignItems: "center", gap: 7, marginTop: index === 0 ? 24 : 4, borderRadius: 7, padding: "0 9px", color: index === (galleryIn > 0.3 ? 3 : boardIn > 0.3 ? 0 : 1) ? "#091b3f" : "rgb(250 250 250 / 0.62)", background: index === (galleryIn > 0.3 ? 3 : boardIn > 0.3 ? 0 : 1) ? "#78a4ff" : "transparent", fontSize: 9 }}><span>{item}</span></div>)}
        </div>
        <div style={{ position: "absolute", inset: "0 0 0 150px", padding: 20, opacity: 1 - galleryIn }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 13, fontWeight: 700 }}>{boardIn > 0.5 ? uiText("3 个画板 · 全部自动保存") : uiText("素材库 · 24 件作品")}</span><span style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 7, padding: "7px 10px", background: "#e5e5e2", color: MUTED, fontSize: 8 }}><Search size={10} />{uiText("筛选与搜索")}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: boardIn > 0.5 ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 10, marginTop: 18 }}>
            {galleryAssets.slice(0, boardIn > 0.5 ? 3 : 6).map((asset, index) => {
              const itemIn = springIn(frame, fps, 16 + index * 8);
              return <div key={`${asset}-${index}`} style={{ position: "relative", height: boardIn > 0.5 ? 286 : index % 2 ? 182 : 218, overflow: "hidden", borderRadius: 8, opacity: itemIn, background: "#d4d4d1", transform: `translateY(${(1 - itemIn) * 16}px)` }}><img src={asset} alt="" style={imageStyle} />{index === 1 && !boardIn ? <Star size={15} fill="#78a4ff" color="#78a4ff" style={{ position: "absolute", top: 9, right: 9 }} /> : null}{boardIn > 0.5 ? <span style={{ position: "absolute", right: 0, bottom: 0, left: 0, padding: "10px", color: "#fff", background: "rgb(24 24 27 / 0.72)", fontSize: 9 }}>{["品牌春季提案", "产品视觉探索", "故事插画"][index]}</span> : null}</div>;
            })}
          </div>
        </div>
        <div style={{ position: "absolute", inset: "0 0 0 150px", opacity: galleryIn, background: "#21262f", color: "#fafafa" }}>
          <div style={{ display: "flex", height: 54, alignItems: "center", justifyContent: "space-between", padding: "0 18px", fontSize: 10 }}><span style={{ display: "flex", alignItems: "center", gap: 7 }}><CalendarDays size={13} color="#78a4ff" />{uiText("7 月 19 日 · 6 次生成")}</span><span style={{ color: "rgb(250 250 250 / 0.56)" }}>{uiText("环形漫游")}</span></div>
          <div style={{ position: "absolute", inset: "74px 26px 70px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            {galleryAssets.slice(0, 5).map((asset, index) => {
              const itemIn = springIn(frame, fps, FEATURE_3 + 8 + index * 10);
              const distance = Math.abs(index - 2);
              return <div key={`${asset}-gallery`} style={{ width: index === 2 ? 214 : 152, height: index === 2 ? 300 : 226, overflow: "hidden", borderRadius: 8, opacity: itemIn * (1 - distance * 0.16), outline: index === 2 ? "3px solid #78a4ff" : "none", transform: `translateY(${distance * 22 + (1 - itemIn) * 18}px) scale(${1 - distance * 0.08})` }}><img src={asset} alt="" style={imageStyle} /></div>;
            })}
          </div>
          <div style={{ position: "absolute", right: 18, bottom: 16, left: 18, display: "flex", alignItems: "center", justifyContent: "space-between", color: "rgb(250 250 250 / 0.58)", fontSize: 9 }}><span>{uiText("按日期回看创作演进")}</span><span style={{ display: "flex", alignItems: "center", gap: 6, color: "#78a4ff", fontWeight: 700 }}><Sparkles size={11} />{uiText("让 AI 总结值得延续的方向")}</span></div>
        </div>
      </div>
    </DemoShell>
  );
}

const coreScenes = [
  AiAssistantScene,
  ParallelExplorationScene,
  ReferenceGenerationScene
] as const;

const moreScenes = [
  VersionCompareScene,
  CanvasWorkspaceScene,
  TemplateCopilotScene,
  HistoryCommentScene,
  LibraryGalleryScene,
  SliceExportScene
] as const;

function WelcomeScene({ assets, mode, sceneIndex, fadeIn, fadeOut }: SceneProps & { mode: WelcomeDemoMode; sceneIndex: number }): React.ReactElement {
  const scenes = mode === "core" ? coreScenes : moreScenes;
  const Scene = scenes[sceneIndex] ?? AiAssistantScene;
  return <Scene assets={assets} fadeIn={fadeIn} fadeOut={fadeOut} />;
}

export function WelcomeDemoReel({ assets, mode }: WelcomeDemoReelProps): React.ReactElement {
  const scenes = mode === "core" ? coreScenes : moreScenes;
  return (
    <AbsoluteFill style={{ background: "#21262f" }}>
      {scenes.map((_, sceneIndex) => (
        <Sequence
          key={sceneIndex}
          from={sceneIndex * WELCOME_DEMO_SCENE_STEP_FRAMES}
          durationInFrames={WELCOME_DEMO_SCENE_FRAMES}
          premountFor={WELCOME_DEMO_FPS}
        >
          <WelcomeScene
            assets={assets}
            mode={mode}
            sceneIndex={sceneIndex}
            fadeIn={sceneIndex !== 0}
            fadeOut={sceneIndex !== scenes.length - 1}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
