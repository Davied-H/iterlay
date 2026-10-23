export const OPEN_ASSISTANT_PERMISSIONS_EVENT = "iterlay:open-assistant-permissions";
export type ScreenAccessPolicy = "ask" | "allow" | "deny";
export type ScreenPermissionDecision = "allow_once" | "allow_always" | "deny";
export interface ScreenAccessStatus {
  policy: ScreenAccessPolicy;
  systemPermission: "granted" | "denied" | "restricted" | "not-determined" | "unknown";
  platform: string;
}
export interface ScreenCaptureSnapshot {
  mimeType: "image/png";
  dataBase64: string;
  width: number;
  height: number;
}
export function normalizeScreenAccessPolicy(value: unknown): ScreenAccessPolicy {
  return value === "allow" || value === "deny" ? value : "ask";
}
