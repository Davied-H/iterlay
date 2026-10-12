import React, { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  ImagePlus,
  Layers3,
  MoreHorizontal,
  RefreshCw,
  Sparkles
} from "lucide-react";
import lampStudio from "../demo-assets/lamp-studio.jpg";
import architectureDirection from "@/assets/creative-direction-architecture.png";
import galleryDirection from "@/assets/creative-direction-gallery.png";
import rainDirection from "@/assets/creative-direction-rain.png";
import galleryInspiration from "@/assets/creative-inspiration-gallery.png";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import "@/styles.css";
import "./dev-creative-mode-preview.css";

type Screen = "inspiration" | "conversation";
type Candidate = "aura" | "dusk" | "studio";

const candidateImages: Array<{ id: Candidate; label: string; image: string; position: string }> = [
  { id: "aura", label: "建筑留白", image: architectureDirection, position: "center" },
  { id: "dusk", label: "雨幕反光", image: rainDirection, position: "center" },
  { id: "studio", label: "雾面展柜", image: galleryDirection, position: "center" }
];

function Preview(): React.ReactElement {
  const previewRef = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<Screen>("inspiration");
  const [inspirationIndex, setInspirationIndex] = useState(0);
  const [value, setValue] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [selected, setSelected] = useState<Candidate>("dusk");
  const [refined, setRefined] = useState(false);
  const inspirations = [
    {
      serial: "01 / 03",
      source: "本周视觉观察",
      freshness: "今日更新",
      title: "把寻常物件，拍得像刚被未来发现。",
      detail: "透明材质、强侧逆光，以及一处故意失真的比例。",
      image: galleryInspiration,
      palette: ["#12253e", "#e7bc92", "#f7f4ed"]
    },
    {
      serial: "02 / 03",
      source: "你的创作记忆",
      freshness: "基于最近 4 次保留",
      title: "把你熟悉的静物，移到雨后的傍晚。",
      detail: "保留克制的留白，让潮湿路面承担色彩和光。",
      image: lampStudio,
      palette: ["#809490", "#d8d2c7", "#3d4542"]
    }
  ];
  const inspiration = inspirations[inspirationIndex];
  const prompt = submittedPrompt || "我想做一张雨后的城市香水主视觉，克制一点。";

  useGSAP(() => {
    const query = gsap.utils.selector(previewRef);

    if (screen === "inspiration") {
      gsap.fromTo(query("[data-reveal]"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.72, stagger: 0.07, ease: "power3.out" });
      gsap.fromTo(query(".inspiration-slice"), { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.85, stagger: 0.1, delay: 0.18, ease: "power4.out" });
      return;
    }

    gsap.fromTo(query(".creative-pi-message"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
    gsap.fromTo(query(".candidate"), { opacity: 0, y: 26, rotate: -1.5 }, { opacity: 1, y: 0, rotate: 0, duration: 0.62, stagger: 0.09, ease: "power3.out", delay: 0.08 });
  }, { scope: previewRef, dependencies: [screen, inspirationIndex] });

  function start(promptText?: string): void {
    setSubmittedPrompt(promptText || "我想做一张雨后的城市香水主视觉，克制一点。");
    setValue("");
    setScreen("conversation");
  }

  function submit(): void {
    if (!value.trim()) return;
    if (screen === "inspiration") {
      start(value.trim());
      return;
    }
    setRefined(true);
    setValue("");
  }

  return (
    <main className="creative-preview-shell" ref={previewRef}>
      <header className="creative-preview-header">
        {screen === "conversation" ? <button className="creative-icon-button" type="button" aria-label="返回灵感" onClick={() => setScreen("inspiration")}><ArrowLeft /></button> : <div className="creative-mark" aria-label="Iterlay">i</div>}
        {screen === "conversation" ? <div className="creative-header-title"><strong>雨后的气味</strong><span>正在继续</span></div> : null}
        <button className="creative-icon-button" type="button" aria-label="更多选项"><MoreHorizontal /></button>
      </header>

      {screen === "inspiration" ? (
        <section className="creative-stage creative-stage--inspiration">
          <div className="creative-home">
            <article className="inspiration-brief" aria-label="今日灵感">
              <img src={inspiration.image} alt="今日灵感参考图" />
              <div><span>今日灵感 / {inspiration.source}</span><p>{inspiration.title}</p></div>
              <button className="creative-icon-button" type="button" aria-label="换一条灵感" onClick={() => setInspirationIndex((inspirationIndex + 1) % inspirations.length)}><RefreshCw /></button>
            </article>
            <div className="creative-start" data-reveal>
              <div className="creative-composer creative-composer--home" data-has-value={Boolean(value.trim())}>
                <button type="button" className="composer-attach" aria-label="添加图片参考"><ImagePlus /></button>
                <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="写下第一个念头" rows={1} aria-label="创作输入" />
                <button className="composer-send" type="button" aria-label="发送创作要求" disabled={!value.trim()} onClick={submit}><ArrowUp /></button>
              </div>
              <p className="creative-start-caption">一句话、一张图或一段链接，都可以开始。</p>
            </div>
            <section className="today-recommendations" aria-label="今日推荐">
              <header><span>今日推荐</span></header>
              <div>{candidateImages.map((candidate, index) => <button key={candidate.id} type="button" onClick={() => start(`以「${candidate.label}」的方式，延展这个灵感。`)}><i>0{index + 1}</i><strong>{candidate.label}</strong><ChevronRight /></button>)}</div>
            </section>
          </div>
        </section>
        ) : (
          <section className="creative-stage creative-stage--conversation">
            <Conversation className="creative-conversation">
              <ConversationContent className="creative-conversation-content">
                <div className="conversation-day">今天</div>
                <Message from="user" className="creative-user-message"><MessageContent>{prompt}</MessageContent></Message>
                <Message from="assistant" className="creative-pi-message">
                  <div className="pi-avatar"><Sparkles /></div>
                  <MessageContent>
                    <div className="pi-label"><strong>建议</strong><span>根据当前意图与参考整理</span></div>
                    <p>{refined ? "已保留冷色反光，并把主体缩进城市的留白。下一轮将以这张图作为主要参考。" : "先把香水留在潮湿街面的留白里，用低饱和的蓝灰和一束侧逆光建立氛围。下面三个方向都可以继续收敛。"}</p>
                  </MessageContent>
                </Message>
                {!refined ? <section className="direction-grid" aria-label="创作方向">{candidateImages.map((candidate) => <button key={candidate.id} type="button" onClick={() => setSelected(candidate.id)} data-selected={selected === candidate.id}><span className={`direction-symbol direction-symbol--${candidate.id}`} /><span>{candidate.label}</span>{selected === candidate.id ? <Check /> : null}</button>)}</section> : null}
                <section className={`generation-stack ${refined ? "generation-stack--refined" : ""}`} aria-label="创作候选">
                  <div className="generation-stack-head"><div><span>三个方向</span><small>{refined ? "已衔接到下一轮" : "从当前想法展开"}</small></div></div>
                  <div className="candidate-rail">{candidateImages.map((candidate) => <button key={candidate.id} type="button" onClick={() => setSelected(candidate.id)} className="candidate" data-selected={selected === candidate.id} aria-label={`选择${candidate.label}`}><img src={candidate.image} style={{ objectPosition: candidate.position }} alt={`${candidate.label}候选`} /><span>{candidate.label}</span>{selected === candidate.id ? <b><Check /></b> : null}</button>)}</div>
                  <div className="generation-stack-foot"><span><Layers3 /> 这组结果会保留在本次创作中</span><button type="button" onClick={() => { setValue("保留这一张的氛围，主体再小一些。") }} >继续这个方向 <ChevronRight /></button></div>
                </section>
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </section>
        )}

      {screen === "conversation" ? <footer className="creative-composer-wrap">
        <div className="composer-context">继续描述你想要的变化</div>
        <div className="creative-composer" data-has-value={Boolean(value.trim())}>
          <button type="button" className="composer-attach" aria-label="添加图片参考"><ImagePlus /></button>
          <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="继续描述你想要的变化…" rows={1} aria-label="创作输入" />
          <button className="composer-send" type="button" aria-label="发送创作要求" disabled={!value.trim()} onClick={submit}><ArrowUp /></button>
        </div>
      </footer> : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Preview /></React.StrictMode>);
