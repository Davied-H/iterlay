import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useUiText } from "@/i18n";
import { resolveFieldChapters, type FieldChapterId } from "@shared/field-chapters";
import type { FieldChapterNavigationProps } from "./FieldChapterNavigation";
import "./field-chapters.css";

/** A compact navigation over the real imported FIELD board, not a second tutorial canvas. */
export function FieldChapterNavigationContent({ board, jobs, onLocate, onDeliver }: FieldChapterNavigationProps): React.ReactElement | null {
  const uiText = useUiText();
  const regionId = useId();
  const chapters = useMemo(() => resolveFieldChapters(board, jobs), [board, jobs]);
  const [selected, setSelected] = useState<FieldChapterId>("source");
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedBoardId, setDismissedBoardId] = useState<string | null>(null);
  useEffect(() => { setSelected("source"); setCollapsed(false); }, [board.id]);
  if (!chapters.length || dismissedBoardId === board.id) return null;
  const chapter = chapters.find((entry) => entry.id === selected) ?? chapters[0];
  return <aside className="field-chapter-navigation nodrag nopan nowheel" aria-label={uiText("FIELD 示例章节")}>
    <div className="field-chapter-heading">
      <button type="button" aria-expanded={!collapsed} aria-controls={regionId} onClick={() => setCollapsed((current) => !current)}>
        <strong>{uiText("FIELD 实例")}</strong>{collapsed ? <ChevronDown /> : <ChevronUp />}
      </button>
      <button type="button" aria-label={uiText("关闭示例章节")} onClick={() => setDismissedBoardId(board.id)}><X /></button>
    </div>
    <div id={regionId} hidden={collapsed}>
      <nav aria-label={uiText("选择示例章节")} className="field-chapter-tabs">
        {chapters.map((entry, index) => <button key={entry.id} type="button" disabled={!entry.targets.length}
          aria-current={selected === entry.id ? "step" : undefined}
          title={!entry.targets.length ? uiText("该章节的图片或历史已移除") : uiText(entry.description)}
          onClick={() => { setSelected(entry.id); if (entry.id !== "delivery") onLocate(entry.targets[0]); }}>
          <span aria-hidden="true">{index + 1}</span>{uiText(entry.title)}
        </button>)}
      </nav>
      <p aria-live="polite">{uiText(chapter.description)}</p>
      {chapter.id === "delivery" ? <button type="button" className="field-chapter-action" disabled={!chapter.targets.length} onClick={() => onDeliver(chapter.targets)}>{uiText("设置三个交付文件")}</button> : <button type="button" className="field-chapter-action" disabled={!chapter.targets.length} onClick={() => onLocate(chapter.targets[0])}>{uiText("定位图片与版本")}</button>}
    </div>
  </aside>;
}
