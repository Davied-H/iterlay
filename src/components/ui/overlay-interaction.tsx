import { createContext, useCallback, useContext, useEffect, useState } from "react";

const OverlayInteractionContext = createContext(true);
export const OverlayInteractionProvider = OverlayInteractionContext.Provider;
export function useOverlayInteraction(): boolean { return useContext(OverlayInteractionContext); }

/** Portals inherit React context even when their DOM lives outside the inert workspace. */
export function useScopedOverlayState(open: boolean | undefined, defaultOpen: boolean | undefined, onOpenChange?: (open: boolean) => void) {
  const interactive = useOverlayInteraction();
  const [localOpen, setLocalOpen] = useState(defaultOpen ?? false);
  useEffect(() => {
    if (interactive) return;
    setLocalOpen(false);
    if (open) onOpenChange?.(false);
  }, [interactive, open, onOpenChange]);
  const change = useCallback((next: boolean) => {
    if (!interactive && next) return;
    if (open === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  }, [interactive, open, onOpenChange]);
  return { open: interactive && (open ?? localOpen), onOpenChange: change };
}
