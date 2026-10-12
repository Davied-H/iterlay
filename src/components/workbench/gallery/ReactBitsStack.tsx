import { motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./ReactBitsStack.css";

interface CardRotateProps {
  children: React.ReactNode;
  onSendToBack: () => void;
  sensitivity: number;
  disableDrag?: boolean;
}

function CardRotate({ children, onSendToBack, sensitivity, disableDrag = false }: CardRotateProps): React.ReactElement {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [60, -60]);
  const rotateY = useTransform(x, [-100, 100], [-60, 60]);

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo): void {
    if (Math.abs(info.offset.x) > sensitivity || Math.abs(info.offset.y) > sensitivity) {
      onSendToBack();
    } else {
      x.set(0);
      y.set(0);
    }
  }

  if (disableDrag) {
    return (
      <motion.div className="card-rotate-disabled" style={{ x: 0, y: 0 }}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="card-rotate"
      style={{ x, y, rotateX, rotateY }}
      drag
      dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
      dragElastic={0.6}
      whileTap={{ cursor: "grabbing" }}
      onDragEnd={handleDragEnd}
    >
      {children}
    </motion.div>
  );
}

export interface ReactBitsStackProps {
  randomRotation?: boolean;
  sensitivity?: number;
  sendToBackOnClick?: boolean;
  cards?: React.ReactNode[];
  animationConfig?: { stiffness: number; damping: number };
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  mobileClickOnly?: boolean;
  mobileBreakpoint?: number;
  reduceMotion?: boolean;
  onTopCardChange?: (index: number) => void;
}

const DEFAULT_ANIMATION = { stiffness: 260, damping: 20 };

export function ReactBitsStack({
  randomRotation = false,
  sensitivity = 200,
  cards = [],
  animationConfig = DEFAULT_ANIMATION,
  sendToBackOnClick = false,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = false,
  mobileClickOnly = false,
  mobileBreakpoint = 768,
  reduceMotion = false,
  onTopCardChange
}: ReactBitsStackProps): React.ReactElement {
  const [isMobile, setIsMobile] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const indexedCards = useMemo(() => cards.map((content, index) => ({ id: index, content })), [cards]);
  const [stack, setStack] = useState(indexedCards);

  useEffect(() => {
    const checkMobile = (): void => setIsMobile(window.innerWidth < mobileBreakpoint);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [mobileBreakpoint]);

  useEffect(() => {
    setStack(indexedCards);
  }, [indexedCards]);

  const shouldDisableDrag = mobileClickOnly && isMobile;
  const shouldEnableClick = sendToBackOnClick || shouldDisableDrag;

  const sendToBack = useCallback((id: number): void => {
    setStack((current) => {
      if (current.length <= 1) return current;
      const next = [...current];
      const index = next.findIndex((card) => card.id === id);
      if (index < 0) return current;
      const [card] = next.splice(index, 1);
      next.unshift(card);
      return next;
    });
  }, []);

  useEffect(() => {
    const topCard = stack[stack.length - 1];
    if (topCard) onTopCardChange?.(topCard.id);
  }, [onTopCardChange, stack]);

  useEffect(() => {
    if (!autoplay || stack.length <= 1 || isPaused) return;
    const interval = window.setInterval(() => {
      const topCardId = stack[stack.length - 1].id;
      sendToBack(topCardId);
    }, autoplayDelay);
    return () => window.clearInterval(interval);
  }, [autoplay, autoplayDelay, isPaused, sendToBack, stack]);

  return (
    <div
      className="stack-container"
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
    >
      {stack.map((card, index) => {
        const randomRotate = randomRotation ? ((card.id * 37) % 11) - 5 : 0;
        return (
          <CardRotate
            key={card.id}
            onSendToBack={() => sendToBack(card.id)}
            sensitivity={sensitivity}
            disableDrag={shouldDisableDrag || reduceMotion}
          >
            <motion.div
              className="card"
              onClick={() => shouldEnableClick && sendToBack(card.id)}
              animate={{
                rotateZ: reduceMotion ? 0 : (stack.length - index - 1) * 4 + randomRotate,
                scale: 1 + index * 0.06 - stack.length * 0.06,
                transformOrigin: "90% 90%"
              }}
              initial={false}
              transition={reduceMotion ? { duration: 0 } : {
                type: "spring",
                stiffness: animationConfig.stiffness,
                damping: animationConfig.damping
              }}
            >
              {card.content}
            </motion.div>
          </CardRotate>
        );
      })}
    </div>
  );
}
