import { useCallback, useEffect, useRef, useState } from "react";

export const CONNECTION_POINTS_HIDE_DELAY_MS = 1_500;

export function useDelayedConnectionPoints(): {
  visible: boolean;
  showConnectionPoints: () => void;
  scheduleConnectionPointsHide: () => void;
} {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const showConnectionPoints = useCallback((): void => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);
  }, []);

  const scheduleConnectionPointsHide = useCallback((): void => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setVisible(false);
    }, CONNECTION_POINTS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
  }, []);

  return { visible, showConnectionPoints, scheduleConnectionPointsHide };
}
