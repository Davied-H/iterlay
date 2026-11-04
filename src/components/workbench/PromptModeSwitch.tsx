import { useUiLocale, useUiText } from "@/i18n";
import "./prompt-mode-switch.css";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

const MOTION = { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" };
interface ModeSnapshot {
  panel: HTMLElement;
  rect: DOMRect;
  controls: Array<{ node: HTMLElement; rect: DOMRect }>;
}

/** Keep the dock and its controls anchored while changing input modes. */
export function PromptModeSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const uiText = useUiText();
  const locale = useUiLocale();
  const groupRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<ModeSnapshot | null>(null);
  const animationsRef = useRef<Animation[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      animationsRef.current.forEach((animation) => animation.cancel());
    },
    [],
  );

  function changeMode(next: boolean) {
    if (next === enabled) return;
    const panel = groupRef.current?.closest<HTMLElement>(".prompt-fusion");
    if (panel)
      snapshotRef.current = {
        panel,
        rect: panel.getBoundingClientRect(),
        controls: [
          ...panel.querySelectorAll<HTMLElement>(
            ".prompt-mode-switch, .prompt-fusion-controls > button",
          ),
        ].map((node) => ({ node, rect: node.getBoundingClientRect() })),
      };
    onChange(next);
  }

  useLayoutEffect(() => {
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    if (!snapshot) return;
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
    clearTimeout(timerRef.current);
    const { panel } = snapshot;
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !panel.animate
    ) {
      panel.removeAttribute("data-mode-changing");
      return;
    }
    // Preserve the visible position before the source dock performs its height transition.
    const next = panel.getBoundingClientRect();
    const dx = snapshot.rect.left - next.left;
    const dy = snapshot.rect.bottom - next.bottom;
    const controls = snapshot.controls
      .filter(({ node }) => node.isConnected)
      .map(({ node, rect }) => {
        const target = node.getBoundingClientRect();
        return {
          node,
          dx: rect.left - target.left - dx,
          dy: rect.top - target.top - dy,
        };
      });
    panel.setAttribute("data-mode-changing", "");
    const move = (node: HTMLElement, x: number, y: number) => {
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
      animationsRef.current.push(
        node.animate(
          [{ translate: `${x}px ${y}px` }, { translate: "0px 0px" }],
          MOTION,
        ),
      );
    };
    move(panel, dx, dy);
    controls.forEach(({ node, dx: x, dy: y }) => move(node, x, y));
    timerRef.current = setTimeout(() => {
      panel.removeAttribute("data-mode-changing");
      animationsRef.current = [];
    }, MOTION.duration);
  }, [enabled]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home" ? true : event.key === "End" ? false : !enabled;
    changeMode(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(
        `[data-mode="${next ? "ai" : "direct"}"]`,
      )
      ?.focus();
  }
  return (
    <div
      ref={groupRef}
      className="prompt-mode-switch"
      role="radiogroup"
      aria-label={uiText("输入模式")}
      data-locale={locale}
      data-active={enabled ? "ai" : "direct"}
    >
      <span className="prompt-mode-labels" aria-hidden="true">
        <span>AI</span>
        <span>{uiText("普通")}</span>
      </span>
      <span className="prompt-mode-thumb" aria-hidden="true">
        <span className="prompt-mode-thumb-labels">
          <span>AI</span>
          <span>{uiText("普通")}</span>
        </span>
      </span>
      <button
        type="button"
        role="radio"
        data-mode="ai"
        aria-checked={enabled}
        tabIndex={enabled ? 0 : -1}
        onClick={() => changeMode(true)}
        onKeyDown={onKeyDown}
      >
        AI
      </button>
      <button
        type="button"
        role="radio"
        data-mode="direct"
        aria-checked={!enabled}
        tabIndex={enabled ? -1 : 0}
        onClick={() => changeMode(false)}
        onKeyDown={onKeyDown}
      >
        {uiText("普通")}
      </button>
    </div>
  );
}
