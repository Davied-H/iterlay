import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface SegmentedControlIndicatorProps {
  layoutId: string;
  className?: string;
}

/** Shared moving layer for segmented controls; labels and focus rings stay above it. */
export function SegmentedControlIndicator({
  layoutId,
  className
}: SegmentedControlIndicatorProps): React.ReactElement {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      data-segmented-control-indicator=""
      layoutId={layoutId}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 z-0", className)}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 520, damping: 38, mass: 0.7 }
      }
    />
  );
}
