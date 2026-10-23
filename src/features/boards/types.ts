import type { CanvasNodeLayout } from "@/components/canvas/canvas-history";
import type { ImageDeliveryRecipe } from "@shared/image-delivery";

import type {
  BoardComicDramaEntryNode,
  BoardConnection,
  BoardGenerationNode,
  BoardTextNode,
  BoardCanvasNode,
  BoardVideoGenerationNode,
  BoardVideoNode,
  BoardVideoSequenceEntryNode,
  BoardViewport,
  ComicDramaBoardNode
} from "@shared/types";

export interface ActiveBoard {
  deliveryRecipes?: ImageDeliveryRecipe[];
  id: string;
  name: string;
  kind?: "standard" | "comic-drama";
  parentBoardId?: string;
  viewport?: BoardViewport;
}
export interface CanvasLayoutState {
  positions: Record<string, CanvasNodeLayout>;
  viewport?: BoardViewport;
  connections: BoardConnection[];
}
export type CanvasPersistedNode = BoardCanvasNode | BoardTextNode | BoardGenerationNode | BoardVideoNode | BoardVideoGenerationNode | ComicDramaBoardNode | BoardComicDramaEntryNode | BoardVideoSequenceEntryNode;
