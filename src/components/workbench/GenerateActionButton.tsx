import { useUiText } from "@/i18n";
import { gsap, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";
import type {
  GenerateButtonStyle
} from "@shared/types";
import { useReducedMotion } from "framer-motion";
import { Blend, CircleCheck, Send, Sparkles, Zap } from "lucide-react";
import { useRef, useState } from "react";
const PRISMATIC_LAYERS = [
  { delay: "0s", duration: "25s" },
  { delay: "0.15s", duration: "15.9s" },
  { delay: "0.53s", duration: "26.4s" },
  { delay: "0.45s", duration: "17.8s" },
  { delay: "1.6s", duration: "19.2s" },
  { delay: "1.6s", duration: "29.2s" },
  { delay: "1.6s", duration: "20.2s" }
] as const;

export function GenerateActionButton({
  buttonStyle,
  compact = false,
  children,
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { buttonStyle: GenerateButtonStyle; compact?: boolean }): React.ReactElement {
  const uiText = useUiText();
  const [sendAnimationNonce, setSendAnimationNonce] = useState(0);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const reduceSendMotion = useReducedMotion();
  const label = typeof children === "string" || typeof children === "number" ? String(children) : "生成";
  const acknowledgementLabel = label === "去配置" || label === "Configure"
    ? "已打开"
    : label === "应用编辑" || label === "Apply edit" ? "已应用" : "已提交";
  const localizedLabel = uiText(label);
  const localizedAcknowledgementLabel = uiText(acknowledgementLabel);
  const displayChildren = typeof children === "string" || typeof children === "number"
    ? localizedLabel
    : children;

  useGSAP(() => {
    const button = sendButtonRef.current;
    if (!button || buttonStyle !== "send" || sendAnimationNonce === 0) return;

    const select = gsap.utils.selector(button);
    const defaultState = select<HTMLElement>("[data-send-default]")[0];
    const sentState = select<HTMLElement>("[data-send-sent]")[0];
    const defaultIcon = select<SVGElement>("[data-send-default] svg")[0];
    const sentIcon = select<SVGElement>("[data-send-sent] svg")[0];
    const defaultChars = select<HTMLElement>("[data-send-default] [data-send-char]");
    const sentChars = select<HTMLElement>("[data-send-sent] [data-send-char]");
    if (!defaultState || !sentState || !defaultIcon || !sentIcon) return;

    const finish = (): void => {
      setSendAnimationNonce((current) => current === sendAnimationNonce ? 0 : current);
    };
    const timeline = gsap.timeline({ onComplete: finish });

    if (reduceSendMotion) {
      timeline
        .set(defaultState, { autoAlpha: 0 })
        .set(sentState, { autoAlpha: 1 })
        .to({}, { duration: 0.7 })
        .set(sentState, { autoAlpha: 0 })
        .set(defaultState, { autoAlpha: 1 });
      return;
    }

    gsap.set(sentState, { autoAlpha: 1 });
    gsap.set(sentChars, { opacity: 0, y: -12, rotation: -18, filter: "blur(4px)" });
    gsap.set(sentIcon, { opacity: 0, scale: 0.5, rotation: -35 });

    timeline
      .to(defaultChars, {
        opacity: 0,
        y: 12,
        filter: "blur(4px)",
        duration: 0.24,
        ease: "power2.in",
        stagger: 0.025
      }, 0)
      .to(defaultIcon, {
        x: 76,
        y: -4,
        opacity: 0,
        scale: 0.25,
        rotation: 45,
        duration: 0.42,
        ease: "power2.in"
      }, 0)
      .to(sentIcon, {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 0.34,
        ease: "back.out(1.7)"
      }, 0.28)
      .to(sentChars, {
        opacity: 1,
        y: 0,
        rotation: 0,
        filter: "blur(0px)",
        duration: 0.3,
        ease: "power3.out",
        stagger: 0.055
      }, 0.34)
      .to({}, { duration: 0.68 })
      .to(sentChars, {
        opacity: 0,
        y: 8,
        filter: "blur(3px)",
        duration: 0.18,
        ease: "power2.in",
        stagger: 0.018
      })
      .to(sentIcon, { opacity: 0, scale: 0.7, duration: 0.18, ease: "power2.in" }, "<")
      .set(sentState, { autoAlpha: 0 })
      .fromTo(defaultIcon, {
        x: -24,
        y: 12,
        opacity: 0,
        scale: 1.35,
        rotation: -45
      }, {
        x: 0,
        y: 0,
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 0.32,
        ease: "power3.out"
      })
      .fromTo(defaultChars, {
        opacity: 0,
        y: -8,
        filter: "blur(3px)"
      }, {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.24,
        ease: "power2.out",
        stagger: 0.025
      }, "<0.04");
  }, {
    scope: sendButtonRef,
    dependencies: [localizedAcknowledgementLabel, buttonStyle, reduceSendMotion, sendAnimationNonce],
    revertOnUpdate: true
  });

  function handleSendStyleClick(event: React.MouseEvent<HTMLButtonElement>): void {
    onClick?.(event);
    if (event.defaultPrevented || props.disabled) return;

    setSendAnimationNonce((current) => current + 1);
  }

  if (buttonStyle === "glow") {
    return (
      <button
        type="button"
        className={cn("generate-glow-button shrink-0", compact && "generate-glow-button--compact", className)}
        onClick={onClick}
        {...props}
      >
        <span className="generate-glow-dots" aria-hidden />
        <Sparkles className="generate-glow-sparkle" aria-hidden />
        <span className="generate-glow-text">{displayChildren}</span>
      </button>
    );
  }

  if (buttonStyle === "prismatic") {
    return (
      <button
        type="button"
        className={cn(
          "generate-prismatic-button shrink-0",
          compact && "generate-prismatic-button--compact",
          className
        )}
        onClick={onClick}
        {...props}
      >
        <span className="generate-prismatic-light" aria-hidden />
        {PRISMATIC_LAYERS.map((layer, index) => (
          <span
            key={`${layer.delay}-${layer.duration}-${index}`}
            className={cn(
              "generate-prismatic-layer",
              index === PRISMATIC_LAYERS.length - 1 && "generate-prismatic-layer--dodge"
            )}
            style={{ animationDelay: layer.delay, animationDuration: layer.duration }}
            aria-hidden
          />
        ))}
        <span className="generate-prismatic-content">
          <Blend aria-hidden />
          {displayChildren}
        </span>
      </button>
    );
  }

  if (buttonStyle === "send") {
    return (
      <button
        ref={sendButtonRef}
        type="button"
        className={cn(
          "generate-send-button shrink-0",
          compact && "generate-send-button--compact",
          sendAnimationNonce > 0 && "generate-send-button--animating",
          className
        )}
        aria-label={localizedLabel}
        onClick={handleSendStyleClick}
        {...props}
      >
        <span className="generate-send-outline" aria-hidden />
        <span data-send-default className="generate-send-state generate-send-state--default" aria-hidden>
          <span className="generate-send-icon">
            <Send />
          </span>
          <span className="generate-send-label">
            {Array.from(localizedLabel).map((character, index) => (
              <span data-send-char key={`${character}-${index}`} style={{ "--generate-send-index": index } as React.CSSProperties}>
                {character}
              </span>
            ))}
          </span>
        </span>
        <span data-send-sent className="generate-send-state generate-send-state--sent" aria-hidden>
          <span className="generate-send-icon">
            <CircleCheck />
          </span>
          <span className="generate-send-label">
            {Array.from(localizedAcknowledgementLabel).map((character, index) => (
              <span data-send-char key={`${character}-${index}`} style={{ "--generate-send-index": index } as React.CSSProperties}>
                {character}
              </span>
            ))}
          </span>
        </span>
        <span className="sr-only" aria-live="polite">{sendAnimationNonce > 0 ? localizedAcknowledgementLabel : ""}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn("generate-action-button shrink-0", compact && "generate-action-button--compact", className)}
      onClick={onClick}
      {...props}
    >
      <span className="generate-action-fold" aria-hidden />
      <span className="generate-action-points" aria-hidden>
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </span>
      <span className="generate-action-inner">
        <Zap aria-hidden />
        {displayChildren}
      </span>
    </button>
  );
}
