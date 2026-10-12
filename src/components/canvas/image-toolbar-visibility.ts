export interface ImageToolbarVisibilityState {
  hasMultipleSelection: boolean;
  selected: boolean;
  hoverEnabled: boolean;
  hovered: boolean;
  menuOpen: boolean;
  noticeOpen: boolean;
}

export interface TemplateExtractableImage {
  path: string;
  dataUrl: string;
  pending?: boolean;
  source?: "generated" | "upload" | "slice";
}

/** A completed canvas image can become a template even when it has no generation history. */
export function canExtractImageTemplate(image: TemplateExtractableImage): boolean {
  return !image.pending && Boolean(image.path || image.dataUrl);
}

/** Batch selection owns the toolbar area; node-level actions resume after it ends. */
export function shouldShowImageToolbar(state: ImageToolbarVisibilityState): boolean {
  if (state.hasMultipleSelection) return false;
  return (
    state.selected ||
    (state.hoverEnabled && state.hovered) ||
    state.menuOpen ||
    state.noticeOpen
  );
}
