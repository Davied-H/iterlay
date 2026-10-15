export const WINDOW_SAVE_REQUEST = "window:save-request";
export const WINDOW_SAVE_RESULT = "window:save-result";
export const WINDOW_RENDERER_READY = "window:renderer-ready";
export interface WindowSaveRequest { requestId: string }
export interface WindowSaveResult { requestId: string; ok: boolean; error?: string }
