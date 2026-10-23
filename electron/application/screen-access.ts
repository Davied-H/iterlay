import type { ScreenCaptureSnapshot } from "../../shared/screen-access.js";
import { normalizeScreenAccessPolicy } from "../../shared/screen-access.js";
import type { SceneAssistantInteraction } from "../../shared/types.js";
import { ProviderError } from "../providers/errors.js";

type InteractionResponse = { action: "submit" | "dismiss"; values?: Record<string, string | string[]> };
interface ScreenAccessDependencies {
  getPolicy: () => unknown;
  setPolicy: (policy: "allow") => void;
  capture: () => Promise<ScreenCaptureSnapshot>;
}

/** Authorization is enforced by the host, before capturing any pixels. */
export function createScreenAccessService(dependencies: ScreenAccessDependencies) {
  return async (options: {
    reason: string;
    providerLabel: string;
    presentInteraction?: (interaction: SceneAssistantInteraction) => Promise<InteractionResponse>;
    signal?: AbortSignal;
  }): Promise<ScreenCaptureSnapshot> => {
    let persistentAuthorization = false;
    const assertActive = (): void => {
      if (options.signal?.aborted) throw new ProviderError("REQUEST_CANCELLED", "屏幕查看已取消。");
      const policy = normalizeScreenAccessPolicy(dependencies.getPolicy());
      if (policy === "deny") {
        throw new ProviderError("SCREEN_ACCESS_DENIED", "屏幕访问已在设置中关闭。你仍可以上传截图作为参考图。");
      }
      if (persistentAuthorization && policy !== "allow") throw new ProviderError("SCREEN_ACCESS_DENIED", "屏幕访问的持续授权已撤销，请重新授权后重试。");
    };
    assertActive();
    persistentAuthorization = normalizeScreenAccessPolicy(dependencies.getPolicy()) === "allow";
    if (!persistentAuthorization) {
      if (!options.presentInteraction) throw new ProviderError("SCREEN_AUTHORIZATION_REQUIRED", "查看屏幕需要在应用内授权。");
      const response = await options.presentInteraction({
        type: "permission",
        capability: "screen-capture",
        title: "允许助手查看当前屏幕？",
        description: options.reason,
        providerLabel: options.providerLabel
      });
      assertActive();
      const decision = response.values?.permissionDecision;
      if (response.action !== "submit" || decision !== "allow_once" && decision !== "allow_always") {
        throw new ProviderError("SCREEN_ACCESS_DENIED", "用户未授权查看屏幕，不得声称已看到屏幕内容。可以继续文字沟通或使用用户上传的截图。");
      }
      if (decision === "allow_always") { dependencies.setPolicy("allow"); persistentAuthorization = true; }
    }
    assertActive();
    const snapshot = await dependencies.capture();
    // Revocation or cancellation while the OS was capturing also prevents disclosure.
    assertActive();
    return snapshot;
  };
}
