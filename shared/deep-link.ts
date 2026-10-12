export const ITERLAY_DEEP_LINK_SCHEME = "iterlay";
export const ITERLAY_DEEP_LINK_CHANNEL = "deep-link:open";
export const ITERLAY_DEEP_LINK_READY_CHANNEL = "deep-link:ready";

export type DeepLinkLibraryTab = "boards" | "assets" | "templates" | "trash";
export type DeepLinkNodeView = "focus" | "details" | "edit";
export type DeepLinkTemplateAction = "preview" | "apply";
export type DeepLinkSettingsSection = "default" | "providers" | "models";

export type IterlayDeepLink =
  | { kind: "library"; tab: DeepLinkLibraryTab }
  | { kind: "board"; boardId: string; nodeId?: string; view: DeepLinkNodeView; prompt?: string }
  | { kind: "template"; templateId: string; action: DeepLinkTemplateAction }
  | {
      kind: "compose";
      boardId?: string;
      templateId?: string;
      prompt?: string;
      mode?: "generate" | "edit";
    }
  | { kind: "import"; source: string }
  | { kind: "gallery"; boardId?: string }
  | { kind: "settings"; section: DeepLinkSettingsSection };

export type ParseIterlayDeepLinkResult =
  | { ok: true; value: IterlayDeepLink; canonicalUrl: string }
  | { ok: false; reason: string };

const MAX_URL_LENGTH = 8_192;
const MAX_ID_LENGTH = 256;
const MAX_PROMPT_LENGTH = 4_000;

function hasDisallowedIdCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || character === "/" || character === "\\";
  });
}

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment).trim();
    return decoded.length > 0 &&
      decoded.length <= MAX_ID_LENGTH &&
      !hasDisallowedIdCharacter(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function parseVersion(url: URL): boolean {
  const version = url.searchParams.get("v");
  return version === null || version === "1";
}

function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T | null {
  if (value === null || value === "") return fallback;
  return allowed.includes(value as T) ? value as T : null;
}

function canonicalize(url: URL): string {
  url.protocol = `${ITERLAY_DEEP_LINK_SCHEME}:`;
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  return url.toString();
}

export function parseIterlayDeepLink(rawUrl: string): ParseIterlayDeepLinkResult {
  if (rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    return { ok: false, reason: "链接为空或过长。" };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "链接格式无效。" };
  }

  if (url.protocol.toLowerCase() !== `${ITERLAY_DEEP_LINK_SCHEME}:`) {
    return { ok: false, reason: "不是 Iterlay 链接。" };
  }
  if (url.username || url.password || !url.hostname || !parseVersion(url)) {
    return { ok: false, reason: "链接包含不支持的认证信息、主机或版本。" };
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "scenes") url.hostname = "templates";
  const canonicalUrl = canonicalize(url);

  if (host === "boards") {
    if (segments.length === 0) {
      return { ok: true, value: { kind: "library", tab: "boards" }, canonicalUrl };
    }
    const boardId = decodeSegment(segments[0]);
    if (!boardId) return { ok: false, reason: "画板 ID 无效。" };
    if (segments.length === 1) {
      return { ok: true, value: { kind: "board", boardId, view: "focus" }, canonicalUrl };
    }
    if (segments.length === 3 && segments[1] === "nodes") {
      const nodeId = decodeSegment(segments[2]);
      const view = parseEnum(url.searchParams.get("view"), ["focus", "details", "edit"] as const, "focus");
      const prompt = url.searchParams.get("prompt")?.trim() || undefined;
      if (!nodeId || !view || (prompt && prompt.length > MAX_PROMPT_LENGTH)) {
        return { ok: false, reason: "节点 ID、视图或提示词无效。" };
      }
      return { ok: true, value: { kind: "board", boardId, nodeId, view, prompt }, canonicalUrl };
    }
    return { ok: false, reason: "不支持的画板链接路径。" };
  }

  if (host === "assets" && segments.length === 0) {
    return { ok: true, value: { kind: "library", tab: "assets" }, canonicalUrl };
  }

  if ((host === "templates" || host === "scenes") && segments.length <= 1) {
    if (segments.length === 0) {
      return { ok: true, value: { kind: "library", tab: "templates" }, canonicalUrl };
    }
    const templateId = decodeSegment(segments[0]);
    const action = parseEnum(url.searchParams.get("action"), ["preview", "apply"] as const, "preview");
    if (!templateId || !action) return { ok: false, reason: "模板 ID 或动作无效。" };
    return { ok: true, value: { kind: "template", templateId, action }, canonicalUrl };
  }

  if (host === "trash" && segments.length === 0) {
    return { ok: true, value: { kind: "library", tab: "trash" }, canonicalUrl };
  }

  if (host === "gallery" && segments.length <= 1) {
    const decodedBoardId = segments[0] ? decodeSegment(segments[0]) : undefined;
    if (segments[0] && !decodedBoardId) return { ok: false, reason: "画板 ID 无效。" };
    const boardId = decodedBoardId ?? undefined;
    return { ok: true, value: { kind: "gallery", boardId }, canonicalUrl };
  }

  if (host === "settings" && segments.length <= 1) {
    const section = parseEnum(
      segments[0] ?? null,
      ["default", "providers", "models"] as const,
      "default"
    );
    if (!section) return { ok: false, reason: "设置分区无效。" };
    return { ok: true, value: { kind: "settings", section }, canonicalUrl };
  }

  if (host === "compose" && segments.length === 0) {
    const boardIdValue = url.searchParams.get("boardId");
    const templateIdValue = url.searchParams.get("templateId") ?? url.searchParams.get("sceneId");
    const promptValue = url.searchParams.get("prompt");
    const boardId = boardIdValue ? boardIdValue.trim() : undefined;
    const templateId = templateIdValue ? templateIdValue.trim() : undefined;
    const prompt = promptValue?.trim() || undefined;
    const mode = parseEnum(url.searchParams.get("mode"), ["generate", "edit"] as const, "generate");
    if (
      (boardId && boardId.length > MAX_ID_LENGTH) ||
      (templateId && templateId.length > MAX_ID_LENGTH) ||
      (prompt && prompt.length > MAX_PROMPT_LENGTH) ||
      !mode
    ) {
      return { ok: false, reason: "创作参数无效或过长。" };
    }
    if (!boardId && !templateId && !prompt) {
      return { ok: false, reason: "创作链接至少需要一个画板、模板或提示词参数。" };
    }
    return {
      ok: true,
      value: { kind: "compose", boardId, templateId, prompt, mode },
      canonicalUrl
    };
  }

  if (host === "import" && segments.length === 0) {
    const source = url.searchParams.get("source")?.trim();
    if (!source || source.length > MAX_URL_LENGTH) {
      return { ok: false, reason: "分享链接为空或过长。" };
    }
    try {
      const sourceUrl = new URL(source);
      if (
        (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") ||
        sourceUrl.username ||
        sourceUrl.password
      ) {
        return { ok: false, reason: "分享链接必须是有效的 HTTP 或 HTTPS 地址。" };
      }
    } catch {
      return { ok: false, reason: "分享链接格式无效。" };
    }
    return { ok: true, value: { kind: "import", source }, canonicalUrl };
  }

  return { ok: false, reason: "不支持的 Iterlay 链接。" };
}

export function extractIterlayDeepLinks(argv: readonly string[]): string[] {
  return argv.filter((value) => value.toLowerCase().startsWith(`${ITERLAY_DEEP_LINK_SCHEME}://`));
}
