import {
  createElement,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import "./text-type.css";

interface TextTypeProps extends HTMLAttributes<HTMLElement> {
  className?: string;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorCharacter?: ReactNode;
  cursorBlinkDuration?: number;
  cursorClassName?: string;
  hideCursorAfterComplete?: boolean;
  text: string | string[];
  as?: ElementType;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  loop?: boolean;
  variableSpeed?: { min: number; max: number };
  onComplete?: () => void;
}

/**
 * Adapted from React Bits TextType. The typing model stays compatible with the
 * original component; the cursor uses CSS so the app does not need GSAP solely
 * for a blink animation.
 */
export function TextType({
  text,
  as: Component = "span",
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  className = "",
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = "|",
  cursorClassName = "",
  hideCursorAfterComplete = false,
  cursorBlinkDuration = 0.5,
  variableSpeed,
  onComplete,
  ...props
}: TextTypeProps): React.ReactElement {
  const [displayedText, setDisplayedText] = useState("");
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const textArray = useMemo(() => {
    const values = Array.isArray(text) ? text : [text];
    return values.length > 0 ? values : [""];
  }, [text]);
  const timeoutRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const getTypingSpeed = useCallback((): number => {
    if (!variableSpeed) return typingSpeed;
    return Math.random() * (variableSpeed.max - variableSpeed.min) + variableSpeed.min;
  }, [typingSpeed, variableSpeed]);

  useEffect(() => {
    const currentText = textArray[currentTextIndex] ?? "";

    if (isDeleting) {
      if (displayedText === "") {
        setIsDeleting(false);
        if (currentTextIndex === textArray.length - 1 && !loop) return;
        setCurrentTextIndex((current) => (current + 1) % textArray.length);
        setCurrentCharIndex(0);
        return;
      }
      timeoutRef.current = window.setTimeout(() => {
        setDisplayedText((current) => current.slice(0, -1));
      }, deletingSpeed);
    } else if (currentCharIndex < currentText.length) {
      timeoutRef.current = window.setTimeout(
        () => {
          setDisplayedText((current) => current + currentText[currentCharIndex]);
          setCurrentCharIndex((current) => current + 1);
        },
        currentCharIndex === 0 && displayedText === "" ? initialDelay : getTypingSpeed()
      );
    } else if (loop || currentTextIndex < textArray.length - 1) {
      timeoutRef.current = window.setTimeout(() => setIsDeleting(true), pauseDuration);
    } else if (!completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current?.();
    }

    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [
    currentCharIndex,
    currentTextIndex,
    deletingSpeed,
    displayedText,
    getTypingSpeed,
    initialDelay,
    isDeleting,
    loop,
    pauseDuration,
    textArray
  ]);

  const currentText = textArray[currentTextIndex] ?? "";
  const hasCompleted = !loop && currentTextIndex === textArray.length - 1 && currentCharIndex >= currentText.length;
  const shouldHideCursor =
    (hideCursorWhileTyping && (currentCharIndex < currentText.length || isDeleting)) ||
    (hideCursorAfterComplete && hasCompleted);

  return createElement(
    Component,
    { className: `text-type ${className}`.trim(), ...props },
    <span className="text-type__content">{displayedText}</span>,
    showCursor ? (
      <span
        aria-hidden
        className={`text-type__cursor ${cursorClassName} ${shouldHideCursor ? "text-type__cursor--hidden" : ""}`.trim()}
        style={{ animationDuration: `${cursorBlinkDuration * 2}s` }}
      >
        {cursorCharacter}
      </span>
    ) : null
  );
}
