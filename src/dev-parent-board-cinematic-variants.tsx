import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Clapperboard,
  FolderOpen,
  MoreHorizontal,
  Play
} from "lucide-react";
import rainImage from "@/assets/creative-direction-rain.png";
import "./dev-parent-board-cinematic-variants.css";

type VariantId = "lower-third" | "title-card" | "vertical";

const variants: Array<{ id: VariantId; label: string; note: string }> = [
  { id: "lower-third", label: "C1 · 片名落底", note: "推荐 · 画面完整，信息集中在底部" },
  { id: "title-card", label: "C2 · 中央片名", note: "戏剧感最强 · 片名成为第一视觉焦点" },
  { id: "vertical", label: "C3 · 纵向刊名", note: "东方感更强 · 更适合新国风题材" }
];

function App(): React.ReactElement {
  const [variant, setVariant] = useState<VariantId>("lower-third");
  const active = variants.find((item) => item.id === variant) ?? variants[0];

  return (
    <main className="cinematic-review">
      <header className="cinematic-review-bar">
        <div>
          <strong>父画板卡片 · 电影海报延展</strong>
          <span>{active.note}</span>
        </div>
        <nav aria-label="电影海报构图方案">
          {variants.map((item) => (
            <button
              key={item.id}
              type="button"
              className={variant === item.id ? "active" : ""}
              aria-pressed={variant === item.id}
              onClick={() => setVariant(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="review-size">420 × 304 · 100%</span>
      </header>

      <section className="cinematic-canvas">
        <div className="canvas-path"><span>普通画板</span><i />新国风悬疑短剧<i />雨夜来信</div>
        <div className="selection-frame" aria-hidden />
        {variant === "lower-third" ? <LowerThirdCard /> : null}
        {variant === "title-card" ? <TitleCard /> : null}
        {variant === "vertical" ? <VerticalCard /> : null}
        <div className="canvas-zoom">100%</div>
      </section>
    </main>
  );
}

function MoreButton(): React.ReactElement {
  return <button type="button" className="more-button" title="更多操作"><MoreHorizontal aria-hidden /></button>;
}

function StageBadge(): React.ReactElement {
  return <span className="stage-badge"><i />角色设定中</span>;
}

function ProjectMark(): React.ReactElement {
  return <span className="project-mark"><Clapperboard aria-hidden /></span>;
}

function LowerThirdCard(): React.ReactElement {
  return (
    <article className="cinematic-card lower-third-card">
      <img className="poster-image" src={rainImage} alt="" />
      <div className="lower-third-shade" />
      <header className="poster-top">
        <div><ProjectMark /><span>漫剧项目 · 01</span></div>
        <div><StageBadge /><MoreButton /></div>
      </header>
      <section className="lower-third-copy">
        <span>新国风悬疑 · 9:16 · 30 秒</span>
        <h1>雨夜来信</h1>
        <p>一封迟到十年的信，在暴雨夜重新抵达。</p>
      </section>
      <footer className="lower-third-footer">
        <div className="progress-copy"><span>制作进度</span><strong>42%</strong></div>
        <div className="progress-track"><i /></div>
        <button type="button">继续制作<ArrowRight aria-hidden /></button>
      </footer>
    </article>
  );
}

function TitleCard(): React.ReactElement {
  return (
    <article className="cinematic-card title-card">
      <img className="poster-image" src={rainImage} alt="" />
      <div className="title-card-shade" />
      <header className="title-card-top">
        <StageBadge />
        <MoreButton />
      </header>
      <section className="center-title">
        <span>一封迟到十年的信</span>
        <h1>雨夜来信</h1>
        <i />
        <p>新国风悬疑短剧</p>
      </section>
      <footer className="title-card-footer">
        <div><span>01</span><small>漫剧项目</small></div>
        <div><span>9:16</span><small>画面比例</small></div>
        <div><span>30″</span><small>目标时长</small></div>
        <button type="button" title="继续制作"><Play aria-hidden /></button>
      </footer>
    </article>
  );
}

function VerticalCard(): React.ReactElement {
  return (
    <article className="cinematic-card vertical-card">
      <img className="poster-image" src={rainImage} alt="" />
      <div className="vertical-shade" />
      <header className="vertical-top">
        <div><ProjectMark /><span>COMIC · 01</span></div>
        <MoreButton />
      </header>
      <section className="vertical-copy">
        <div className="vertical-context">
          <StageBadge />
          <p>一封迟到十年的信，<br />在暴雨夜重新抵达。</p>
          <span>新国风悬疑 · 30 秒</span>
        </div>
        <h1><span>雨夜</span><span>来信</span></h1>
      </section>
      <footer className="vertical-footer">
        <span><i><b /></i><em>42%</em></span>
        <button type="button"><FolderOpen aria-hidden />打开画板</button>
      </footer>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
