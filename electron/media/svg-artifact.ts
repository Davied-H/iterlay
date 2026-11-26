import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";

const ELEMENTS = new Set("svg g defs path rect circle ellipse line polyline polygon linearGradient radialGradient stop clipPath mask text tspan title desc symbol use pattern".split(" "));
const ATTRIBUTES = new Set("id x y x1 y1 x2 y2 cx cy r rx ry d points width height viewBox preserveAspectRatio fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity transform gradientTransform gradientUnits offset stop-color stop-opacity spreadMethod fx fy fr clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits patternUnits patternContentUnits patternTransform font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline letter-spacing word-spacing dx dy rotate textLength lengthAdjust vector-effect color display visibility href".split(" "));
const fragment = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/u;
const paint = /^url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.:-]*['"]?\s*\)$/u;
const escapeXML = (value: string) => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");

export function svgDimensions(attributes: Record<string, string>): { width: number; height: number } | null {
  const dimension = (value = "") => /^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/u.test(value.trim()) ? Math.ceil(parseFloat(value)) : 0;
  const viewBox = (attributes.viewBox ?? "").trim().split(/[\s,]+/u).map(Number);
  const width = dimension(attributes.width) || (viewBox.length === 4 ? Math.ceil(viewBox[2]) : 0);
  const height = dimension(attributes.height) || (viewBox.length === 4 ? Math.ceil(viewBox[3]) : 0);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    && width <= 16384 && height <= 16384 && width * height <= 64 * 1024 * 1024 ? { width, height } : null;
}

/** Re-encode a static SVG allowlist, following Leru's artifact policy. Never embed raw model markup. */
export function sanitizeSvg(bytes: Buffer) {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("SVG 文件为空或超过 2 MB。");
  const source = bytes.toString("utf8").replace(/^\uFEFF/u, "").replace(/^\s*<\?xml\s[^?]*\?>/u, "");
  if (/<!DOCTYPE|<!ENTITY|<\?/iu.test(source)) throw new Error("SVG 包含不支持的文档指令。");
  const document = parse(source, { lowerCaseTagName: false, comment: false });
  const roots = document.childNodes.filter((node) => node.nodeType !== NodeType.TEXT_NODE || node.textContent.trim());
  if (roots.length !== 1 || !(roots[0] instanceof HTMLElement) || roots[0].rawTagName !== "svg") throw new Error("SVG 根节点无效。");
  const root = roots[0];
  if (root.getAttribute("xmlns") && root.getAttribute("xmlns") !== "http://www.w3.org/2000/svg") throw new Error("SVG 命名空间无效。");
  const dimensions = svgDimensions(root.attributes);
  if (!dimensions) throw new Error("SVG 缺少有效尺寸或尺寸超出限制。");
  let count = 0;
  const encode = (node: Node, depth: number): string => {
    if (++count > 10000 || depth > 64) throw new Error("SVG 节点数或嵌套深度超出限制。");
    if (node.nodeType === NodeType.TEXT_NODE) return escapeXML(node.textContent);
    if (!(node instanceof HTMLElement) || !ELEMENTS.has(node.rawTagName)) return "";
    const attributes = new Map<string, string>();
    const add = (name: string, value: string) => {
      if (!ATTRIBUTES.has(name) || value.length > 128 * 1024 || attributes.has(name)) return;
      if (name === "href" && !fragment.test(value)) return;
      if (value.includes("\\") || value.includes("@") || [...value].some((character) => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0))) || /javascript:|data:|https?:|expression/iu.test(value)) return;
      if (/url/iu.test(value) && !paint.test(value)) return;
      attributes.set(name, value);
    };
    for (const [key, value] of Object.entries(node.attributes)) {
      if (key === "style") {
        for (const part of value.split(";")) {
          const colon = part.indexOf(":");
          if (colon > 0) add(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
        }
      } else add(key === "xlink:href" ? "href" : key, value);
    }
    const xmlns = node === root ? ' xmlns="http://www.w3.org/2000/svg"' : "";
    const attrs = [...attributes].map(([key, value]) => ` ${key}="${escapeXML(value)}"`).join("");
    return `<${node.rawTagName}${xmlns}${attrs}>${node.childNodes.map((child) => encode(child, depth + 1)).join("")}</${node.rawTagName}>`;
  };
  return { bytes: Buffer.from(encode(root, 1)), ...dimensions };
}
