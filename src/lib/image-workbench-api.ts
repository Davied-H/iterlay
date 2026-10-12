import type { ImageWorkbenchApi } from "../../electron/preload/preload";

interface ImageWorkbenchHost {
  imageWorkbench?: ImageWorkbenchApi;
}

export const missingImageWorkbenchMessage =
  "Electron preload bridge 未加载。请用 pnpm electron:dev 启动桌面应用，不要单独打开 Vite 页面。";

export function hasImageWorkbenchApi(
  host: ImageWorkbenchHost = globalThis as ImageWorkbenchHost
): host is ImageWorkbenchHost & { imageWorkbench: ImageWorkbenchApi } {
  return Boolean(host.imageWorkbench);
}

export function getImageWorkbenchApi(host: ImageWorkbenchHost = globalThis as ImageWorkbenchHost): ImageWorkbenchApi {
  if (!hasImageWorkbenchApi(host)) {
    throw new Error(missingImageWorkbenchMessage);
  }

  return host.imageWorkbench;
}

/** 清理 Electron invoke 的实现细节前缀，并把常见 Provider 错误转成面向用户的提示。 */
export function getWorkbenchErrorMessage(error: unknown, fallback = "桌面应用通信失败。"): string {
  let message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  message = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^(?:(?:[A-Za-z][A-Za-z0-9]*Error|Error):\s*)+/i, "")
    .trim();

  if (/exhausted balance|user is locked[\s\S]*balance/i.test(message)) {
    return "fal.ai 账户余额不足，请前往 https://fal.ai/dashboard/billing 充值后重试。";
  }
  if (/invalid (?:credentials|api key)|unauthori[sz]ed/i.test(message)) {
    return "API Key 无效或无权访问，请检查 Provider 配置。";
  }
  if (/invalid device public key/i.test(message)) {
    return "设备验证信息无效，请重启 Iterlay 后重试。";
  }
  return message || fallback;
}
