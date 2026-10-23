import { useEffect, useId, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Pencil,
} from "lucide-react";
import { useUiText } from "@/i18n";
import { getGenerationTiming } from "@/lib/generation-timing";
import "./assistant-decision-cards.css";

export { AssistantQuestionnaire as CreateQuestionCard } from "./questions/AssistantQuestionnaire";

interface CreatePlanCardProps {
  prompt: string;
  targetLabel: string;
  active: boolean;
  confirmed?: boolean;
  historical?: boolean;
  generating: boolean;
  generationStartedAt: number | null;
  comicDrama?: boolean;
  mediaType?: "image" | "video";
  progressLabel?: string;
  count?: number;
  disabled?: boolean;
  onRefine: () => void;
  onGenerate: () => void;
}

export function CreatePlanCard({
  prompt,
  targetLabel,
  active,
  confirmed = false,
  historical = false,
  generating,
  generationStartedAt,
  comicDrama = false,
  mediaType = "image",
  progressLabel,
  count = 1,
  disabled = false,
  onRefine,
  onGenerate,
}: CreatePlanCardProps): React.ReactElement {
  const uiText = useUiText();
  const promptId = useId();
  const [expanded, setExpanded] = useState(false);
  const generationTiming = useCreateGenerationTiming(
    generating ? generationStartedAt : null,
  );
  const longPrompt = prompt.length > 240 || prompt.split("\n").length > 5;

  if (generating) {
    return (
      <section
        className="ct-generation"
        aria-busy="true"
        aria-label={
          comicDrama
            ? uiText("正在添加到画板")
            : uiText(mediaType === "video" ? "正在生成视频" : "正在生成图片")
        }
      >
        <div className="ct-generation-heading" role="status" aria-live="polite">
          <span className="ct-status-dot" aria-hidden="true" />
          <h3>
            {comicDrama
              ? uiText("正在添加到画板")
              : uiText(mediaType === "video" ? "正在生成视频" : "正在生成图片")}
          </h3>
        </div>

        {comicDrama ? (
          <div className="ct-document-progress">
            <Layers size={24} strokeWidth={1.5} aria-hidden="true" />
            <p>
              {uiText(
                "正在创建普通画板并添加 1 张漫剧设定卡，不会调用媒体模型。",
              )}
            </p>
          </div>
        ) : (
          <div className="ct-generation-preview" aria-hidden="true">
            <div className="ct-generation-preview-content">
              {mediaType === "video" ? (
                <Film size={29} strokeWidth={1.35} />
              ) : (
                <ImageIcon size={29} strokeWidth={1.35} />
              )}
              <span>
                {uiText(
                  progressLabel ||
                    (mediaType === "video" ? "视频正在生成" : "画面正在成形"),
                )}
              </span>
            </div>
          </div>
        )}

        {generationTiming && !comicDrama && mediaType !== "video" ? (
          <div className="ct-generation-timing" aria-live="off">
            <span>
              {uiText("已用 ")}
              <time>{generationTiming.elapsedLabel}</time>
            </span>
            <span>
              {generationTiming.overdue ? (
                uiText("比预计久一点，任务仍在处理中")
              ) : (
                <>
                  {uiText("预计剩余 ")}
                  <time>{generationTiming.remainingLabel}</time>
                </>
              )}
            </span>
          </div>
        ) : null}

        <details className="ct-generation-prompt">
          <summary>
            {uiText("查看创作方案")}
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <p className="ct-plan-prompt">{prompt}</p>
        </details>
      </section>
    );
  }

  if (!active) {
    return (
      <details className="ct-plan-archive">
        <summary>
          {confirmed ? (
            <Check className="ct-archive-icon" size={17} aria-hidden="true" />
          ) : (
            <FileText
              className="ct-archive-icon"
              size={17}
              aria-hidden="true"
            />
          )}
          <span className="ct-archive-label">
            <strong>
              {historical
                ? uiText("历史创作方案")
                : confirmed
                  ? uiText("已执行的创作方案")
                  : uiText("此前的创作方案")}
            </strong>
            <span>
              {historical
                ? uiText("已保存的提示词")
                : confirmed
                  ? comicDrama
                    ? uiText("已添加到画板")
                    : uiText("已确认生成")
                  : uiText("已被后续对话替代")}
            </span>
          </span>
          <span className="ct-archive-count">
            {comicDrama
              ? uiText("免费落板")
              : mediaType === "video"
                ? uiText("1 段视频")
                : uiText("{{ui:0}} 张", [count])}
          </span>
          <ChevronDown
            className="ct-details-chevron"
            size={16}
            aria-hidden="true"
          />
        </summary>
        <div className="ct-archive-body">
          <p className="ct-plan-prompt">{prompt}</p>
          {comicDrama ? (
            <p className="ct-plan-note">
              {uiText("本步不生成图片或视频，不产生媒体费用")}
            </p>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section className="ct-card ct-plan" aria-labelledby={`${promptId}-title`}>
      <header className="ct-card-heading ct-plan-heading">
        <span className="ct-plan-heading-icon" aria-hidden="true">
          {comicDrama ? (
            <Layers size={19} strokeWidth={1.6} />
          ) : mediaType === "video" ? (
            <Film size={19} strokeWidth={1.6} />
          ) : (
            <ImageIcon size={19} strokeWidth={1.6} />
          )}
        </span>
        <div>
          <h3 id={`${promptId}-title`}>{uiText("创作方案已准备好")}</h3>
          <p>
            {comicDrama
              ? uiText("确认后添加到「{{ui:0}}」", [targetLabel])
              : uiText("确认后生成到「{{ui:0}}」", [targetLabel])}
          </p>
        </div>
        <span className="ct-plan-count">
          {comicDrama
            ? uiText("免费落板")
            : mediaType === "video"
              ? uiText("1 段视频")
              : uiText("{{ui:0}} 张", [count])}
        </span>
      </header>

      <p
        id={promptId}
        className="ct-plan-prompt"
        data-collapsed={longPrompt && !expanded}
      >
        {prompt}
      </p>
      {longPrompt ? (
        <button
          type="button"
          className="ct-prompt-toggle"
          aria-expanded={expanded}
          aria-controls={promptId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? uiText("收起提示词") : uiText("展开完整提示词")}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      ) : null}
      {comicDrama ? (
        <p className="ct-plan-note">
          {uiText("本步不生成图片或视频，不产生媒体费用")}
        </p>
      ) : null}

      <footer className="ct-card-actions">
        <button
          type="button"
          className="ct-button ct-button-quiet"
          disabled={disabled}
          onClick={onRefine}
        >
          <Pencil size={14} aria-hidden="true" />
          {uiText("继续调整")}
        </button>
        <button
          type="button"
          className="ct-button ct-button-primary"
          disabled={disabled}
          onClick={onGenerate}
        >
          {comicDrama ? uiText("在画板中开始") : uiText("确认生成")}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}

function useCreateGenerationTiming(
  startedAt: number | null,
): ReturnType<typeof getGenerationTiming> | null {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (startedAt === null) return;
    const update = (): void => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === null ? null : getGenerationTiming(startedAt, now);
}
