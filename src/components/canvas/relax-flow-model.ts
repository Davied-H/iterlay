export interface RelaxPoint {
  x: number;
  y: number;
}

export interface RelaxBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RelaxElementBase {
  id: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
}

export type RelaxFlowElement =
  | (RelaxElementBase & { kind: "brush"; points: RelaxPoint[] })
  | (RelaxElementBase & { kind: "rect"; bounds: RelaxBounds; fillOpacity: number })
  | (RelaxElementBase & { kind: "ellipse"; bounds: RelaxBounds; fillOpacity: number })
  | (RelaxElementBase & { kind: "arrow"; start: RelaxPoint; end: RelaxPoint })
  | (RelaxElementBase & {
      kind: "text";
      bounds: RelaxBounds;
      text: string;
      fontSize: number;
      align: "left" | "center" | "right";
      autoSize: boolean;
    });

export function cloneRelaxElements(elements: RelaxFlowElement[]): RelaxFlowElement[] {
  return elements.map((element) => {
    if (element.kind === "brush") {
      return { ...element, points: element.points.map((point) => ({ ...point })) };
    }
    if (element.kind === "arrow") {
      return { ...element, start: { ...element.start }, end: { ...element.end } };
    }
    return { ...element, bounds: { ...element.bounds } };
  });
}

export function getRelaxElementBounds(element: RelaxFlowElement): RelaxBounds {
  if (element.kind === "rect" || element.kind === "ellipse" || element.kind === "text") {
    return element.bounds;
  }
  const points = element.kind === "brush" ? element.points : [element.start, element.end];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = Math.max(6, element.strokeWidth / 2);
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  };
}

export function translateRelaxElement(
  element: RelaxFlowElement,
  delta: RelaxPoint
): RelaxFlowElement {
  if (element.kind === "brush") {
    return {
      ...element,
      points: element.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }))
    };
  }
  if (element.kind === "arrow") {
    return {
      ...element,
      start: { x: element.start.x + delta.x, y: element.start.y + delta.y },
      end: { x: element.end.x + delta.x, y: element.end.y + delta.y }
    };
  }
  return {
    ...element,
    bounds: { ...element.bounds, x: element.bounds.x + delta.x, y: element.bounds.y + delta.y }
  };
}

export function resizeRelaxElement(
  element: RelaxFlowElement,
  from: RelaxBounds,
  to: RelaxBounds
): RelaxFlowElement {
  const scaleX = to.width / Math.max(1, from.width);
  const scaleY = to.height / Math.max(1, from.height);
  const transform = (point: RelaxPoint): RelaxPoint => ({
    x: to.x + (point.x - from.x) * scaleX,
    y: to.y + (point.y - from.y) * scaleY
  });
  if (element.kind === "brush") {
    return { ...element, points: element.points.map(transform) };
  }
  if (element.kind === "arrow") {
    return { ...element, start: transform(element.start), end: transform(element.end) };
  }
  return { ...element, bounds: { ...to } };
}

export function relaxElementLabel(element: RelaxFlowElement): string {
  if (element.kind === "brush") return "自由笔迹";
  if (element.kind === "rect") return "矩形";
  if (element.kind === "ellipse") return "圆形";
  if (element.kind === "arrow") return "箭头";
  return element.text.trim() ? `文字“${element.text.trim()}”` : "文字";
}

export function buildRelaxFlowAnnotationSummary(
  elements: RelaxFlowElement[],
  imageBounds: RelaxBounds
): string {
  return elements.filter((element) => element.visible).map((element, index) => {
    const bounds = getRelaxElementBounds(element);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const relativeX = Math.round(((centerX - imageBounds.x) / imageBounds.width) * 100);
    const relativeY = Math.round(((centerY - imageBounds.y) / imageBounds.height) * 100);
    const relativeWidth = Math.round((bounds.width / imageBounds.width) * 100);
    const relativeHeight = Math.round((bounds.height / imageBounds.height) * 100);
    const relation = relativeX >= 0 && relativeX <= 100 && relativeY >= 0 && relativeY <= 100
      ? "中心位于原图内部"
      : "位于原图外侧";
    const direction = element.kind === "arrow"
      ? `，从 ${Math.round(((element.start.x - imageBounds.x) / imageBounds.width) * 100)}%,${Math.round(((element.start.y - imageBounds.y) / imageBounds.height) * 100)}% 指向 ${Math.round(((element.end.x - imageBounds.x) / imageBounds.width) * 100)}%,${Math.round(((element.end.y - imageBounds.y) / imageBounds.height) * 100)}%`
      : "";
    return `${index + 1}. ${relaxElementLabel(element)}：${relation} ${relativeX}%,${relativeY}%，范围约为原图 ${relativeWidth}%×${relativeHeight}%${direction}，颜色 ${element.color}`;
  }).join("\n");
}
