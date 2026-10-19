import type {
  GenerationResult, ProviderCheck, ProviderConfig, ProviderGenerateInput,
  ProviderTestResult, TextProviderConfig, VideoProviderConfig
} from "../../shared/types.js";
import { imageDimensionsFromHeader } from "../media/image-metadata.js";
import { openRouterVideoApiRoot } from "./video-openrouter.js";

type DiagnosticConfig = ProviderConfig | TextProviderConfig | VideoProviderConfig;
const untested = (message: string): ProviderCheck => ({ status: "not-tested", message });

export function newProviderTestResult(): ProviderTestResult & { checks: NonNullable<ProviderTestResult["checks"]> } {
  return {
    ok: false,
    mode: "connection",
    message: "尚未完成检查。",
    checks: {
      network: untested("未检查网络。"),
      authentication: untested("未检查服务端鉴权。"),
      model: untested("未检查模型目录。"),
      capability: untested("未调用模型；生成、编辑及工具调用能力尚未验证。"),
      generation: untested("未提交生成请求，不产生模型生成用量。")
    },
    billing: { generationSubmitted: false, mayHaveIncurredCharge: false }
  };
}

/** OAuth 凭据可读取不等于服务端鉴权或模型调用成功。 */
export function localCredentialCheck(): ProviderTestResult {
  const result = newProviderTestResult();
  result.ok = true;
  result.message = "账号凭据可读取；未验证网络、服务端鉴权或模型能力，未消耗生成用量。";
  result.checks.authentication = { status: "unknown", message: "本地账号凭据可读取，服务端鉴权未验证。" };
  return result;
}

/** 只发送 GET。404/400 等只能证明服务器响应，不能证明 Key 或模型可用。 */
export async function checkProviderConnection(
  config: DiagnosticConfig,
  apiKey: string,
  kind: "image" | "text" | "video",
  fetchImpl: typeof fetch = fetch
): Promise<ProviderTestResult> {
  const result = newProviderTestResult();
  if (!apiKey.trim()) {
    result.message = "请先填写 API Key。";
    result.checks.authentication = { status: "failed", message: result.message };
    return result;
  }
  const probe = connectionProbe(config, kind);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(probe.url, {
      method: "GET",
      headers: { Authorization: `${config.type === "fal" ? "Key" : "Bearer"} ${apiKey}` },
      signal: controller.signal
    });
    result.checks.network = { status: "passed", message: `服务已响应（HTTP ${response.status}）。` };
    if (!response.ok) {
      result.checks.authentication = {
        status: response.status === 401 || response.status === 403 ? "failed" : "unknown",
        message: response.status === 401 || response.status === 403
          ? "服务端拒绝凭据或访问权限。"
          : "服务端未确认凭据有效。"
      };
      result.message = `基础检查未通过（HTTP ${response.status}）；网络可达不代表鉴权或模型可用。未提交生成请求。`;
      return result;
    }
    if (probe.kind === "task") {
      result.checks.authentication = { status: "unknown", message: "任务查询接口已响应，无法据此确认凭据和模型权限。" };
      result.message = "网络可达；该服务没有可用的只读鉴权探测，鉴权与模型能力未验证。未提交生成请求。";
      return result;
    }
    const payload: unknown = await response.json();
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const entries = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : undefined;
    if (probe.kind === "models" && !entries) {
      result.message = "服务有响应，但未返回可识别的模型目录；鉴权和模型能力未确认。未提交生成请求。";
      result.checks.authentication = { status: "unknown", message: "响应格式不符合模型目录，不能确认鉴权。" };
      return result;
    }
    if (probe.kind === "auth" && (record.error || !Object.keys(record).length || !["data", "current_balance", "balance"].some((key) => key in record))) {
      result.message = "鉴权接口返回格式异常，无法确认凭据；未提交生成请求。";
      result.checks.authentication = { status: "unknown", message: "鉴权响应为空或格式异常。" };
      return result;
    }
    result.checks.authentication = { status: "passed", message: "凭据检查接口已接受请求；具体模型权限仍以实际调用为准。" };
    if (entries) {
      const found = entries.some((entry: unknown) => entry === config.model || Boolean(
        entry && typeof entry === "object" && ["id", "model", "model_id"].some((key) => (entry as Record<string, unknown>)[key] === config.model)
      ));
      result.checks.model = {
        status: found ? "passed" : "unknown",
        message: found ? "当前模型出现在服务目录中；实际调用能力未验证。" : "目录中未找到当前模型；部分服务使用自定义接入点，实际调用能力仍未知。"
      };
    }
    result.ok = true;
    result.message = "基础检查完成；仅检查只读接口，模型实际能力尚未验证。未提交生成请求。";
    return result;
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "检查超时（15 秒）。" : error instanceof Error ? error.message : "检查失败。";
    if (result.checks.network.status !== "passed") result.checks.network = { status: "failed", message };
    result.message = `${message} 未提交生成请求。`;
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function connectionProbe(config: DiagnosticConfig, kind: "image" | "text" | "video"): { url: string; kind: "models" | "auth" | "task" } {
  const base = config.baseUrl.trim().replace(/\/+$/, "");
  if (config.type === "fal") return { url: `${base}/${config.model.replace(/^\/+|\/+$/g, "")}/requests/iterlay-connection-test/status`, kind: "task" };
  if (config.type === "poe") return { url: `${base}/usage/current_balance`, kind: "auth" };
  if (config.type === "openrouter" && kind === "image") return { url: `${base.replace(/\/v1$/, "")}/v1/key`, kind: "auth" };
  if (config.type === "openrouter" && kind === "video") return { url: `${openRouterVideoApiRoot(base)}/videos/models`, kind: "models" };
  if (config.type === "bailian") return { url: `${base}/compatible-mode/v1/models`, kind: "models" };
  if (config.type === "ark" && kind === "video") return { url: `${base}/contents/generations/tasks/non-existent-iterlay-test`, kind: "task" };
  return { url: `${base}${/\/(?:v\d+|api\/v\d+)$/.test(base) ? "" : "/v1"}/models`, kind: "models" };
}

/** 单次主动测试。调用方必须验证收费确认；失败后不自动重试，超时也可能已计费。 */
export async function checkImageGeneration(
  config: ProviderConfig,
  acknowledged: boolean,
  generate: (input: ProviderGenerateInput) => Promise<GenerationResult>
): Promise<ProviderTestResult> {
  const result = newProviderTestResult();
  result.mode = "generation";
  if (!acknowledged) {
    result.message = "请先确认：生成测试图片可能产生服务商费用。";
    return result;
  }
  result.billing = { generationSubmitted: true, mayHaveIncurredCharge: true };
  result.checks.generation = { status: "unknown", message: "已开始提交测试；即使连接中断或超时，也可能已产生费用。" };
  try {
    const generated = await generate({
      workflowMode: "generate", model: config.model,
      prompt: "A simple blue circle on a plain white background, no text.",
      size: "1024x1024", n: 1, outputFormat: "png", referenceImages: []
    });
    const image = generated.images[0];
    if (!image?.bytes.length || !/^image\/(png|jpeg|webp)$/.test(image.mimeType) || !imageDimensionsFromHeader(image.bytes)) throw new Error("服务未返回可查看的测试图片。");
    result.ok = true;
    result.message = "已收到 1 张测试图片；文生图能力已验证。参考图、编辑和工具调用尚未验证，服务商可能已计费。";
    result.checks.network = { status: "passed", message: "已收到生成响应。" };
    result.checks.authentication = { status: "passed", message: "生成接口接受了凭据。" };
    result.checks.capability = { status: "passed", message: "已验证文生图；参考图、编辑及工具调用未验证。" };
    result.checks.generation = { status: "passed", message: "测试图片已返回，不自动保存到画板。" };
    if (image.bytes.length <= 8 * 1024 * 1024) result.previewDataUrl = `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
  } catch (error) {
    result.message = `${error instanceof Error ? error.message : "生成测试失败。"} 请求可能已到达服务商并产生费用；未自动重试。`;
  }
  return result;
}
