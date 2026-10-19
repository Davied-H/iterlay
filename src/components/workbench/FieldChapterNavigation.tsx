import { lazy, Suspense } from "react";
import type { BoardData, GenerationJob } from "@shared/types";
import type { FieldChapterTarget } from "@shared/field-chapters";

export interface FieldChapterNavigationProps {
  board: Pick<BoardData, "id" | "name" | "nodes">;
  jobs: ReadonlyArray<Pick<GenerationJob, "id" | "prompt">>;
  onLocate: (target: FieldChapterTarget) => void;
  onDeliver: (targets: FieldChapterTarget[]) => void;
}

const FieldChapterNavigationContent = lazy(() => import("./FieldChapterNavigationContent")
  .then((module) => ({ default: module.FieldChapterNavigationContent })));

/** Example navigation is optional; its resolver and styles do not block canvas startup. */
export function FieldChapterNavigation(props: FieldChapterNavigationProps): React.ReactElement {
  return <Suspense fallback={null}><FieldChapterNavigationContent {...props} /></Suspense>;
}
