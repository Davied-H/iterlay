import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { BoardSummary } from "@shared/types";
import boardLibraryReference from "@/assets/board-library-reference.png";
import creativeArchitecture from "@/assets/creative-direction-architecture.png";
import creativeGallery from "@/assets/creative-direction-gallery.png";
import creativeRain from "@/assets/creative-direction-rain.png";
import tourLamp from "@/assets/tour-demo-lamp.jpg";
import { BoardLibrary } from "@/components/workbench/BoardLibrary";
import "@/styles.css";

const initialBoards: BoardSummary[] = [
  {
    id: "board-1",
    name: "HMM",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: new Date().toISOString(),
    imageCount: 81,
    storageBytes: 128 * 1024 * 1024,
    thumbnailDataUrl: boardLibraryReference
  },
  {
    id: "board-2",
    name: "Iterlay Logo",
    createdAt: "2026-08-02T09:00:00.000Z",
    updatedAt: "2026-08-22T14:59:00.000Z",
    imageCount: 12,
    storageBytes: 22 * 1024 * 1024,
    thumbnailDataUrl: creativeRain
  },
  {
    id: "board-3",
    name: "空间氛围探索",
    createdAt: "2026-08-03T09:00:00.000Z",
    updatedAt: "2026-08-22T09:00:00.000Z",
    imageCount: 24,
    storageBytes: 46 * 1024 * 1024,
    thumbnailDataUrl: creativeArchitecture
  },
  {
    id: "board-4",
    name: "角色造型研究",
    createdAt: "2026-08-04T09:00:00.000Z",
    updatedAt: "2026-08-22T08:30:00.000Z",
    imageCount: 43,
    storageBytes: 78 * 1024 * 1024,
    thumbnailDataUrl: creativeGallery
  },
  {
    id: "board-5",
    name: "AURA 灯具功能演示",
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-21T18:30:00.000Z",
    imageCount: 36,
    storageBytes: 63 * 1024 * 1024,
    thumbnailDataUrl: tourLamp
  },
  ...Array.from({ length: 5 }, (_, index): BoardSummary => ({
    id: `board-${index + 6}`,
    name: index === 0 ? "未命名画板" : `品牌参考库 ${index}`,
    createdAt: `2026-08-${String(index + 6).padStart(2, "0")}T09:00:00.000Z`,
    updatedAt: `2026-08-${String(20 - index).padStart(2, "0")}T09:00:00.000Z`,
    imageCount: index === 0 ? 0 : 8 + index * 7,
    storageBytes: index === 0 ? 0 : (18 + index * 9) * 1024 * 1024,
    thumbnailDataUrl: index === 0 ? undefined : [creativeRain, creativeArchitecture, creativeGallery][index % 3]
  }))
];

function Preview(): React.ReactElement {
  const [boards, setBoards] = useState(initialBoards);

  return (
    <main className="h-screen bg-background text-foreground">
      <BoardLibrary
        boards={boards}
        activeBoardId="board-1"
        onOpenBoard={() => undefined}
        onPrefetchBoard={() => undefined}
        onCreateBoard={() => undefined}
        onRenameBoard={(id, name) => {
          setBoards((current) => current.map((board) => board.id === id ? { ...board, name } : board));
        }}
        onDuplicateBoard={() => undefined}
        onDeleteBoard={async () => undefined}
        onExportBoard={() => undefined}
        onImportBoard={async () => undefined}
        onImportBoardFiles={async () => undefined}
        onClose={() => undefined}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
