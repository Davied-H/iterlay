export const MEDIA_TOOLS_STATE_CHANNEL = "mediaTools:state";

export interface MediaToolsPaths {
  ffmpeg: string;
  ffprobe: string;
}

export interface MediaToolsState {
  status: "missing" | "checking" | "downloading" | "verifying" | "ready" | "error";
  version: string;
  downloadBytes: number;
  transferredBytes: number;
  error?: string;
}

export interface MediaToolsManifest {
  version: string;
  platform: "darwin";
  arch: "arm64";
  url: string;
  sha256: string;
  sizeBytes: number;
  files: Array<{ path: string; sha256: string; sizeBytes: number }>;
}

export function isMediaToolsRequiredError(error: unknown): boolean {
  const message = typeof error === "string" ? error
    : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return message.includes("MEDIA_TOOLS_REQUIRED");
}
