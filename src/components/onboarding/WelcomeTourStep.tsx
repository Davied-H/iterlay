import appIconUrl from "@/assets/app-icon-default.png";
import lampImageUrl from "@/assets/tour-demo-lamp.jpg";
import type { LicenseState } from "@shared/licensing";
import { AnimatePresence,motion } from "framer-motion";
import {
ArrowRight,
ChevronLeft,
ChevronRight,
PlayCircle,
Plug,
RotateCcw
} from "lucide-react";
import { lazy,Suspense,useEffect,useRef,useState } from "react";
import RotatingText from "./RotatingText";
import { TextType } from "./TextType";
import type { WelcomeDemoPlayerHandle } from "./WelcomeDemoPlayer";
import type { WelcomeDemoMode } from "./remotion/WelcomeDemoReel";
import "./welcome-tour.css";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const OPENING_LINES = ["把参考图放进来。", "写下你想要的画面。", "从画布开始创作。"];
const baseUrl = import.meta.env.BASE_URL;
const WelcomeDemoPlayer = lazy(() => import("./WelcomeDemoPlayer"));

type WelcomeStage = "art" | "art-exit" | "demo" | "choice";

const CORE_DEMO_NARRATION = [
  {
    title: "先说目标，\n再决定怎么改。",
    points: [
      { label: "带上当前画布", detail: "助手会读取选中的作品和已有描述，你不用重复交代背景" },
      { label: "确认下一步", detail: "用一句话说明想保留什么、改变什么" },
      { label: "结果可以撤回", detail: "执行前后都有明确反馈，不满意可以立即撤销" }
    ]
  },
  {
    title: "一次提交，\n多看几个方向。",
    points: [
      { label: "同时生成多个候选", detail: "用同一段描述尝试不同构图、材质和视觉方向" },
      { label: "先完成的先看", detail: "每个任务独立推进，不必等所有结果一起完成" },
      { label: "把结果摆在一起", detail: "并排比较候选，再选择值得继续的方向" }
    ]
  },
  {
    title: "直接拿画布作品，\n作为下一次参考。",
    points: [
      { label: "选择已有作品", detail: "不用先下载，画布上的图片可以直接成为参考" },
      { label: "说明保留什么", detail: "分别约束主体、镜头或氛围，减少意外变化" },
      { label: "结果回到原处", detail: "新图片仍留在当前画板，来源关系也会保留" }
    ]
  }
] as const;

const MORE_DEMO_NARRATION = [
  {
    title: "切换版本，\n看清每次改变。",
    points: [
      { label: "修改自动成为新版本", detail: "原图不会被覆盖，也不会散落成一堆文件" },
      { label: "直接比较差异", detail: "滑动查看构图、光线和局部细节的变化" },
      { label: "从满意的版本继续", detail: "选定方向后再生成，创作过程保持连贯" }
    ]
  },
  {
    title: "把相关作品，\n摆在一起比较。",
    points: [
      { label: "按思路铺开图片", detail: "生成、上传和切图结果都可以自由摆放" },
      { label: "成组选择和移动", detail: "一次整理多张作品，保持原来的比较关系" },
      { label: "位置自动保存", detail: "下次打开画板，会回到离开时的布局" }
    ]
  },
  {
    title: "从一个模板开始，\n只填关键内容。",
    points: [
      { label: "先选常用场景", detail: "电商、概念和插画等任务已经准备好描述结构" },
      { label: "补充关键变量", detail: "只填写主体、材质、光线等真正影响结果的内容" },
      { label: "确认后再生成", detail: "系统补全完整描述，你仍可以检查和修改" }
    ]
  },
  {
    title: "从历史记录，\n继续一次有效尝试。",
    points: [
      { label: "按批次回看", detail: "每次生成的描述、参数、参考图和结果都会保留" },
      { label: "复用有效设置", detail: "找到好方向后直接回填，不必重新配置" },
      { label: "把反馈留在图片上", detail: "评论跟随对应作品保存，之后回来仍能看到" }
    ]
  },
  {
    title: "离开以后，\n也能从原处继续。",
    points: [
      { label: "常用图片收进素材库", detail: "按来源、收藏和标签查找，随时放回画布使用" },
      { label: "每个项目单独保存", detail: "不同任务放在不同画板，互不影响" },
      { label: "按日期回看过程", detail: "在画廊浏览生成记录，再决定下一步继续什么" }
    ]
  },
  {
    title: "选好区域，\n再批量导出。",
    points: [
      { label: "先自动识别", detail: "从完整画面中找出可以单独使用的主体和版块" },
      { label: "逐个检查边界", detail: "预览每个区域，必要时再手动调整范围" },
      { label: "确认后一次导出", detail: "批量保存原图和独立素材，也可以收进素材库" }
    ]
  }
] as const;

const DEMO_NARRATIONS = {
  core: CORE_DEMO_NARRATION,
  more: MORE_DEMO_NARRATION
} as const;

interface WelcomeTourStepProps {
  titleId: string;
  descriptionId: string;
  title: string;
  description: string;
  reduceMotion: boolean;
  creditBalance?: number;
  licenseState?: LicenseState | null;
  onContinue: () => void;
  onConnectProvider?: () => void;
  onOpenLicense?: () => void;
}

export function WelcomeTourStep({
  titleId,
  descriptionId,
  title,
  description,
  reduceMotion,
  onConnectProvider,
}: WelcomeTourStepProps): React.ReactElement {
  const [leaving, setLeaving] = useState(false);
  const [stage, setStage] = useState<WelcomeStage>(reduceMotion ? "choice" : "art");
  const [demoMode, setDemoMode] = useState<WelcomeDemoMode>("core");
  const [demoScene, setDemoScene] = useState(0);
  const [demoCue, setDemoCue] = useState(0);
  const timerRef = useRef<number | null>(null);
  const artHoldTimerRef = useRef<number | null>(null);
  const artExitTimerRef = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const demoPlayerRef = useRef<WelcomeDemoPlayerHandle>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const narrationList = DEMO_NARRATIONS[demoMode];
  const narration = narrationList[demoScene] ?? CORE_DEMO_NARRATION[0];

  useEffect(() => {
    // Radix menus restore focus to their trigger after closing. Wait for that
    // hand-off, then move focus into the newly opened modal if it is still outside.
    const focusTimer = window.setTimeout(() => {
      if (!document.activeElement?.closest?.('[role="dialog"]')) continueButtonRef.current?.focus();
    }, 220);
    return () => {
      window.clearTimeout(focusTimer);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (artHoldTimerRef.current !== null) window.clearTimeout(artHoldTimerRef.current);
      if (artExitTimerRef.current !== null) window.clearTimeout(artExitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (stage !== "choice") return;
    const focusTimer = window.setTimeout(() => continueButtonRef.current?.focus(), reduceMotion ? 0 : 360);
    return () => window.clearTimeout(focusTimer);
  }, [stage, reduceMotion]);

  useEffect(() => {
    const keepFocusInside = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !sectionRef.current) return;
      const focusable = Array.from(
        sectionRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      );
      if (focusable.length === 0) return;
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusable.length - 1
          : currentIndex - 1
        : currentIndex < 0 || currentIndex === focusable.length - 1
          ? 0
          : currentIndex + 1;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };
    window.addEventListener("keydown", keepFocusInside, true);
    return () => window.removeEventListener("keydown", keepFocusInside, true);
  }, []);

  const leave = (callback: () => void): void => {
    if (leaving) return;
    setLeaving(true);
    if (reduceMotion) {
      callback();
      return;
    }
    timerRef.current = window.setTimeout(callback, 300);
  };

  const revealDemo = (): void => {
    if (reduceMotion || stage !== "art") return;
    artHoldTimerRef.current = window.setTimeout(() => {
      setStage("art-exit");
      artExitTimerRef.current = window.setTimeout(() => setStage("demo"), 520);
    }, 700);
  };

  const playDemo = (mode: WelcomeDemoMode): void => {
    setDemoMode(mode);
    setDemoScene(0);
    setDemoCue(0);
    setStage("demo");
  };

  const navigateDemo = (offset: -1 | 1): void => {
    const nextScene = Math.min(narrationList.length - 1, Math.max(0, demoScene + offset));
    if (nextScene === demoScene) return;
    setDemoScene(nextScene);
    setDemoCue(0);
    demoPlayerRef.current?.seekToScene(nextScene);
  };

  const artMotion = (delay: number, x: number, y: number, rotate: number) => ({
    initial: reduceMotion ? false : { opacity: 0, x: x * 0.35, y: y * 0.35, rotate: rotate * 0.35, scale: 0.94 },
    animate: leaving || stage === "art-exit"
      ? { opacity: 0, x: x * 0.12, y: y * 0.12, rotate, scale: 0.98 }
      : { opacity: 1, x: 0, y: 0, rotate, scale: 1 },
    transition: {
      duration: reduceMotion ? 0 : leaving || stage === "art-exit" ? 0.42 : 0.75,
      delay: leaving || stage === "art-exit" ? 0 : delay,
      ease: EASE_OUT
    }
  });

  return (
    <motion.section
      ref={sectionRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`welcome-tour ${stage === "demo" ? "welcome-tour--demo" : ""} ${stage === "choice" ? "welcome-tour--choice" : ""}`}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={leaving ? { opacity: 0, filter: "blur(8px)" } : { opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: reduceMotion ? 0 : leaving ? 0.3 : 0.35, ease: EASE_OUT }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {stage === "demo" || stage === "choice" ? null : (
        <div className="welcome-tour__art" aria-hidden>
          <motion.figure className="welcome-tour__frame welcome-tour__frame--concept" {...artMotion(0.12, 120, -110, 5)}>
            <img src={`${baseUrl}scene-previews/concept/2.webp`} alt="" draggable={false} />
          </motion.figure>
          <motion.figure className="welcome-tour__frame welcome-tour__frame--portrait" {...artMotion(0.2, 190, 35, -4)}>
            <img src={`${baseUrl}scene-previews/portrait/1.webp`} alt="" draggable={false} />
          </motion.figure>
          <motion.figure className="welcome-tour__frame welcome-tour__frame--style" {...artMotion(0.28, -150, 70, -6)}>
            <img src={`${baseUrl}scene-previews/edit-style/2.webp`} alt="" draggable={false} />
          </motion.figure>
          <motion.figure className="welcome-tour__frame welcome-tour__frame--selected" {...artMotion(0.34, 70, 180, 2)}>
            <img src={lampImageUrl} alt="" draggable={false} />
            <span className="welcome-tour__selection" />
          </motion.figure>
        </div>
      )}

      <AnimatePresence initial={false}>
        {stage === "demo" ? (
          <motion.div
            className="welcome-tour__demo"
            aria-hidden
            initial={reduceMotion ? false : { opacity: 0, x: 170, scale: 0.97 }}
            animate={leaving ? { opacity: 0, x: 70, scale: 0.98 } : { opacity: 1, x: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -36, scale: 0.985, filter: "blur(5px)" }}
            transition={{ duration: reduceMotion ? 0 : leaving ? 0.24 : 0.68, ease: EASE_OUT }}
          >
            <Suspense fallback={<div className="welcome-tour__demo-loading" />}>
              <WelcomeDemoPlayer
                ref={demoPlayerRef}
                key={demoMode}
                mode={demoMode}
                onSceneChange={(scene) => {
                  setDemoScene(scene);
                  setDemoCue(0);
                }}
                onCueChange={setDemoCue}
                onComplete={() => setStage("choice")}
              />
            </Suspense>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {stage === "choice" ? (
        <motion.div
          className="welcome-tour__setup-panel"
          aria-label="选择生成服务"
          initial={reduceMotion ? false : { opacity: 0, x: 54, filter: "blur(7px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: reduceMotion ? 0 : 0.72, ease: EASE_OUT }}
        >
          <div className="welcome-tour__setup-heading">
            <span>生成服务</span>
            <span className="welcome-tour__setup-step">最后一步</span>
          </div>
          <button
            type="button"
            className="welcome-tour__service-option"
            ref={continueButtonRef}
            disabled={leaving || !onConnectProvider}
            onClick={() => onConnectProvider && leave(onConnectProvider)}
          >
            <span className="welcome-tour__service-icon"><Plug aria-hidden /></span>
            <span className="welcome-tour__service-copy">
              <span className="welcome-tour__service-title">连接自己的模型服务</span>
              <span className="welcome-tour__service-description">使用 ChatGPT / Codex 登录，或配置 API Key</span>
              <span className="welcome-tour__service-meta">模型费用由对应服务商收取</span>
            </span>
            <ArrowRight aria-hidden className="welcome-tour__service-arrow" />
          </button>
          <p className="welcome-tour__setup-note">Iterlay 永久免费，连接自己的模型服务即可生成。</p>
        </motion.div>
      ) : null}

      <div className="welcome-tour__brand">
        <img src={appIconUrl} alt="" className="welcome-tour__icon" />
        <span>Iterlay</span>
      </div>

      <header className="welcome-tour__header">
        <span className="welcome-tour__edition">
          {stage === "choice" ? "完成设置" : stage === "demo" && demoMode === "more" ? "更多示例" : "快速演示"}
        </span>
      </header>

      <main className="welcome-tour__content">
        <div className="welcome-tour__content-stack">
          <AnimatePresence mode="wait" initial={false}>
            {stage === "demo" ? (
              <motion.div
                key="demo-copy-shell"
                className="welcome-tour__demo-copy-shell"
                initial={reduceMotion ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6, filter: "blur(3px)" }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: EASE_OUT }}
              >
                <div className="welcome-tour__demo-progress" aria-label={`功能演示 ${demoScene + 1} / ${narrationList.length}`}>
                  {narrationList.map((item, index) => (
                    <span key={item.title} data-active={index === demoScene} />
                  ))}
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`demo-copy-${demoScene}`}
                    className="welcome-tour__copy"
                    aria-live="polite"
                    initial={reduceMotion ? false : { opacity: 0, y: 8, filter: "blur(3px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -5, filter: "blur(2px)" }}
                    transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE_OUT }}
                  >
                    <h1
                      id={titleId}
                      className="welcome-tour__title welcome-tour__title--narration"
                      aria-label={narration.title.replace("\n", "")}
                    >
                      {reduceMotion ? (
                        narration.title
                      ) : (
                        <TextType
                          key={`narration-title-${demoScene}`}
                          text={narration.title}
                          typingSpeed={48}
                          variableSpeed={{ min: 34, max: 58 }}
                          initialDelay={100}
                          loop={false}
                          cursorCharacter=""
                          cursorBlinkDuration={0.48}
                          hideCursorAfterComplete
                          aria-hidden
                        />
                      )}
                    </h1>
                    <ul
                      id={descriptionId}
                      className="welcome-tour__description welcome-tour__narration-points"
                      aria-label={narration.points.map((point) => `${point.label}：${point.detail}`).join("；")}
                    >
                      {narration.points.map((point, index) => (
                        <li
                          key={point.label}
                          data-state={index < demoCue ? "done" : index === demoCue ? "active" : "upcoming"}
                        >
                          <span className="welcome-tour__narration-index" aria-hidden>{index + 1}</span>
                          <span className="welcome-tour__narration-content">
                            <strong>{point.label}</strong>
                            <span>{point.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            ) : stage === "choice" ? (
              <motion.div
                key="choice-copy"
                className="welcome-tour__choice-copy"
                initial={reduceMotion ? false : { opacity: 0, y: 16, filter: "blur(5px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0 : 0.58, delay: reduceMotion ? 0 : 0.12, ease: EASE_OUT }}
              >
                <h1 id={titleId} className="welcome-tour__choice-title">
                  <span>现在，</span>
                  <RotatingText
                    texts={["选择怎么开始生成。", "连接你常用的服务。", "准备第一次创作。", "选择怎么开始生成。"]}
                    auto={!reduceMotion}
                    loop={false}
                    rotationInterval={1900}
                    staggerDuration={0.018}
                    staggerFrom="first"
                    transition={{ duration: 0.46, ease: EASE_OUT }}
                    initial={{ y: "105%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "-105%", opacity: 0 }}
                    mainClassName="welcome-tour__choice-rotating"
                  />
                </h1>
                <p id={descriptionId} className="welcome-tour__choice-description">
                  连接你已有的账号或 API Key，开始生成。
                </p>
                <div className="welcome-tour__choice-actions">
                  <button
                    type="button"
                    className="welcome-tour__choice-secondary"
                    disabled={leaving}
                    onClick={() => playDemo("core")}
                  >
                    <RotateCcw aria-hidden className="h-4 w-4" />
                    重新观看
                  </button>
                  <button
                    type="button"
                    className="welcome-tour__choice-secondary"
                    disabled={leaving}
                    onClick={() => playDemo("more")}
                  >
                    <PlayCircle aria-hidden className="h-4 w-4" />
                    查看更多演示
                  </button>
                </div>
                <span className="welcome-tour__choice-note">这些设置之后可以随时从画板中修改</span>
              </motion.div>
            ) : (
              <motion.div
                key="opening-copy"
                className="welcome-tour__copy"
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.16, ease: EASE_OUT }}
              >
                <h1 id={titleId} className="welcome-tour__title welcome-tour__title--opening" aria-label={title}>
                  {reduceMotion ? (
                    OPENING_LINES[OPENING_LINES.length - 1]
                  ) : (
                    <TextType
                      text={OPENING_LINES}
                      typingSpeed={62}
                      variableSpeed={{ min: 42, max: 76 }}
                      initialDelay={380}
                      pauseDuration={860}
                      deletingSpeed={32}
                      loop={false}
                      cursorCharacter=""
                      cursorBlinkDuration={0.48}
                      onComplete={revealDemo}
                    />
                  )}
                </h1>
                <p id={descriptionId} className="welcome-tour__description">{description}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {stage === "demo" ? (
            <motion.div
              className="welcome-tour__actions welcome-tour__actions--demo"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={leaving ? { opacity: 0, y: 6 } : { opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : 0.52, ease: EASE_OUT }}
            >
              <button
                type="button"
                className="welcome-tour__skip welcome-tour__skip-demo"
                disabled={leaving}
                onClick={() => setStage("choice")}
              >
                跳过演示
                <ArrowRight aria-hidden className="h-4 w-4" />
              </button>
              <div className="welcome-tour__demo-navigation" role="group" aria-label="切换功能示例">
                <button
                  type="button"
                  className="welcome-tour__demo-nav"
                  disabled={demoScene === 0}
                  aria-label="上一个示例"
                  title="上一个示例"
                  onClick={() => navigateDemo(-1)}
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="welcome-tour__demo-nav"
                  disabled={demoScene === narrationList.length - 1}
                  aria-label="下一个示例"
                  title="下一个示例"
                  onClick={() => navigateDemo(1)}
                >
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ) : null}
        </div>
      </main>

      <footer className="welcome-tour__footer">
        <span className="welcome-tour__time">
          {stage === "choice" ? "演示完成 · 选择后即可进入画板" : demoMode === "core" ? "约 35 秒" : "约 1 分钟"}
        </span>
      </footer>
    </motion.section>
  );
}
