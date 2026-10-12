import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clapperboard,
  Clock3,
  FolderOpen,
  Images,
  MoreHorizontal,
  Play,
  Sparkles,
  UsersRound
} from "lucide-react";
import rainImage from "@/assets/creative-direction-rain.png";
import architectureImage from "@/assets/creative-direction-architecture.png";
import galleryImage from "@/assets/creative-direction-gallery.png";
import inspirationImage from "@/assets/creative-inspiration-gallery.png";
import "./dev-parent-board-cover-variants.css";

type VariantId = "cinematic" | "filmstrip" | "jacket";

const variants: Array<{ id: VariantId; label: string; note: string }> = [
  { id: "cinematic", label: "B1 · 电影海报", note: "最沉浸 · 用故事与画面建立项目识别" },
  { id: "filmstrip", label: "B2 · 分镜胶片", note: "内容感最强 · 一眼看到素材与片段规模" },
  { id: "jacket", label: "B3 · 项目封套", note: "产品感最稳 · 兼顾封面、状态与继续制作" }
];

function App(): React.ReactElement {
  const [variant, setVariant] = useState<VariantId>("cinematic");
  const active = variants.find((item) => item.id === variant) ?? variants[0];

  return (
    <main className="cover-variant-review">
      <header className="variant-review-bar">
        <div>
          <strong>父画板卡片 · B 版延展</strong>
          <span>{active.note}</span>
        </div>
        <nav aria-label="视觉封面延展方案">
          {variants.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === variant ? "active" : ""}
              aria-pressed={item.id === variant}
              onClick={() => setVariant(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="review-size">420 × 304 · 100%</span>
      </header>

      <section className="variant-canvas">
        <div className="canvas-path"><span>普通画板</span><i />新国风悬疑短剧<i />雨夜来信</div>
        <div className="selection-frame" aria-hidden />
        {variant === "cinematic" ? <CinematicCard /> : null}
        {variant === "filmstrip" ? <FilmstripCard /> : null}
        {variant === "jacket" ? <JacketCard /> : null}
        <div className="canvas-zoom">100%</div>
      </section>
    </main>
  );
}

function ProjectIcon(): React.ReactElement {
  return <span className="project-mark"><Clapperboard aria-hidden /></span>;
}

function CinematicCard(): React.ReactElement {
  return (
    <article className="cover-variant-card cinematic-card">
      <img className="full-cover" src={rainImage} alt="" />
      <div className="cinematic-shade" />
      <header className="cinematic-top">
        <span className="live-stage"><i />角色设定中</span>
        <button type="button" title="更多操作"><MoreHorizontal aria-hidden /></button>
      </header>
      <section className="cinematic-copy">
        <span className="project-number">漫剧项目 · 01</span>
        <h1>雨夜来信</h1>
        <p>一封迟到十年的信，在暴雨夜重新抵达。</p>
      </section>
      <footer className="cinematic-footer">
        <div className="cinematic-meta">
          <span>新国风悬疑</span><i /><span>9:16</span><i /><span>30 秒</span>
        </div>
        <div className="cinematic-progress"><span><b />42%</span></div>
        <button type="button"><span>继续制作</span><ArrowRight aria-hidden /></button>
      </footer>
    </article>
  );
}

const frames = [
  { src: rainImage, label: "主视觉" },
  { src: architectureImage, label: "场景" },
  { src: galleryImage, label: "角色" },
  { src: inspirationImage, label: "片段" }
];

function FilmstripCard(): React.ReactElement {
  return (
    <article className="cover-variant-card filmstrip-card">
      <header className="filmstrip-header">
        <ProjectIcon />
        <div><span>漫剧项目</span><h1>雨夜来信</h1></div>
        <span className="live-stage"><i />角色设定中</span>
        <button type="button" title="更多操作"><MoreHorizontal aria-hidden /></button>
      </header>
      <section className="filmstrip-stage">
        <div className="filmstrip-hero">
          <img src={rainImage} alt="" />
          <span><Play aria-hidden />预览</span>
        </div>
        <div className="filmstrip-info">
          <span className="section-label">项目内容</span>
          <h2>一封迟到十年的信，<br />在暴雨夜重新抵达。</h2>
          <div className="count-row">
            <span><UsersRound aria-hidden /><b>6</b> 角色</span>
            <span><Images aria-hidden /><b>48</b> 素材</span>
          </div>
          <div className="updated-row"><Clock3 aria-hidden />刚刚更新</div>
        </div>
      </section>
      <footer className="frame-rail">
        <div>
          {frames.map((frame, index) => (
            <span key={frame.label} className={index === 0 ? "active" : ""}>
              <img src={frame.src} alt="" /><small>{frame.label}</small>
            </span>
          ))}
        </div>
        <button type="button" title="打开漫剧画板"><FolderOpen aria-hidden /></button>
      </footer>
    </article>
  );
}

const stages = ["故事", "角色", "片段", "画面"];

function JacketCard(): React.ReactElement {
  return (
    <article className="cover-variant-card jacket-card">
      <div className="jacket-cover">
        <img src={rainImage} alt="" />
        <div className="jacket-shade" />
        <span className="jacket-index">01 / COMIC</span>
        <div className="jacket-title"><span>新国风悬疑 · 30 秒</span><h1>雨夜来信</h1></div>
      </div>
      <section className="jacket-panel">
        <header>
          <div><ProjectIcon /><span>漫剧项目</span></div>
          <button type="button" title="更多操作"><MoreHorizontal aria-hidden /></button>
        </header>
        <div className="jacket-status">
          <span>当前阶段</span>
          <strong>角色设定</strong>
          <small>2 / 6 已完成</small>
        </div>
        <div className="jacket-stages">
          {stages.map((stage, index) => (
            <span key={stage} className={index < 2 ? "complete" : ""}>
              <i>{index === 0 ? <Check aria-hidden /> : index + 1}</i>
              <small>{stage}</small>
            </span>
          ))}
        </div>
        <div className="jacket-next">
          <Sparkles aria-hidden />
          <span><small>下一步</small><strong>补全角色视觉锚点</strong></span>
          <ChevronRight aria-hidden />
        </div>
        <button type="button" className="jacket-open">继续制作<ArrowRight aria-hidden /></button>
      </section>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
