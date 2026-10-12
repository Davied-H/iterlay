import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssetComment,
  AssetTagInfo,
  BoardData,
  BoardNodeSnapshot,
  BoardViewport,
  GenerationJob,
  PromptSpec
} from "../shared/types.js";
import { INITIAL_DEMO_BOARD_NAME } from "../shared/demo-board.js";
import { AssetMetaStore } from "./storage/asset-meta-store.js";
import { AssetStore } from "./storage/asset-store.js";
import { BoardStore } from "./storage/board-store.js";
import { CommentStore } from "./storage/comment-store.js";
import { HistoryStore } from "./storage/history-store.js";

export { INITIAL_DEMO_BOARD_NAME } from "../shared/demo-board.js";
export const INITIAL_DEMO_BOARD_VERSION = 2;

export const DEMO_ASSET_FILE_NAMES = {
  cover: "aura-cover.jpg",
  moodboard: "lamp-moodboard.jpg",
  studio: "lamp-studio.jpg",
  dusk: "lamp-dusk.jpg",
  sage: "lamp-sage.jpg",
  contactSheet: "aura-contact-sheet.jpg"
} as const;

export type DemoAssetKey = keyof typeof DEMO_ASSET_FILE_NAMES;
export type DemoAssetPaths = Record<DemoAssetKey, string>;

interface DemoBoardSeed {
  nodes: BoardNodeSnapshot[];
  viewport: BoardViewport;
  jobs: GenerationJob[];
  comments: AssetComment[];
  assetMeta: AssetTagInfo[];
}

interface CreateInitialDemoBoardInput {
  assetsDirectory: string;
  assets: AssetStore;
  boards: BoardStore;
  history: HistoryStore;
  comments: CommentStore;
  assetMeta: AssetMetaStore;
  createThumbnailDataUrl?: (bytes: Buffer) => Promise<string> | string;
}

export interface InitialDemoBoardInstallResult {
  board: BoardData;
  created: boolean;
  isFirstBoard: boolean;
}

const BASE_PROMPT =
  "一盏紧凑的雕塑感便携桌灯，圆润磨砂玻璃灯罩置于低矮拉丝铝底座上，正面保留一枚琥珀色按钮；柔和灰色无缝影棚背景，三分之四视角，高级产品摄影。";
const DUSK_PROMPT =
  "只把背景和光线改为克制的深蓝暮色影棚，让灯光更温暖明亮；保持灯具造型、材质、比例、机位与构图不变。";
const SAGE_PROMPT =
  "只把背景与台面改为低饱和鼠尾草绿，并将正面按钮改为深炭灰；保持灯具造型、玻璃光感、拉丝铝材质、比例、机位与构图不变。";
const CONTACT_SHEET_PROMPT =
  "将 AURA 灯具的三种产品视觉与一张材质情绪版整理为清晰的 2×2 方形接触表，四个等大画面铺满画布。";

function promptSpec(primaryRequest: string, patch: Partial<PromptSpec> = {}): PromptSpec {
  return { primaryRequest, ...patch };
}

function timestamp(base: Date, minutesBefore: number): string {
  return new Date(base.getTime() - minutesBefore * 60_000).toISOString();
}

export function buildInitialDemoBoardSeed(
  boardId: string,
  paths: DemoAssetPaths,
  now = new Date()
): DemoBoardSeed {
  const ids = {
    coverNode: `${boardId}-cover`,
    moodboardNode: `${boardId}-moodboard`,
    versionsNode: `${boardId}-versions`,
    contactSheetNode: `${boardId}-contact-sheet`,
    studioSliceNode: `${boardId}-slice-studio`,
    duskSliceNode: `${boardId}-slice-dusk`,
    generateJob: `${boardId}-generate-studio`,
    duskJob: `${boardId}-edit-dusk`,
    sageJob: `${boardId}-edit-sage`,
    contactSheetJob: `${boardId}-generate-contact-sheet`
  };

  const jobs: GenerationJob[] = [
    {
      id: ids.generateJob,
      status: "succeeded",
      createdAt: timestamp(now, 8),
      completedAt: timestamp(now, 7),
      prompt: BASE_PROMPT,
      providerId: "iterlay-demo",
      providerName: "Iterlay 演示数据",
      model: "gpt-image-2",
      input: {
        workflowMode: "generate",
        useCase: "product-mockup",
        promptSpec: promptSpec(BASE_PROMPT, {
          assetType: "产品目录主视觉",
          inputImages: "AURA 材质与配色情绪版",
          subject: "圆润磨砂玻璃灯罩与拉丝铝底座组成的便携桌灯",
          compositionFraming: "方形画幅，三分之四视角，主体居中完整",
          lightingMood: "柔和影棚日光，安静、精致",
          colorPalette: "银色、磨砂白、琥珀色点缀"
        }),
        prompt: BASE_PROMPT,
        model: "gpt-image-2",
        size: "1024x1024",
        n: 1,
        quality: "high",
        style: "natural"
      },
      useCase: "product-mockup",
      referenceImagePaths: [paths.moodboard],
      outputImagePaths: [paths.studio],
      boardId
    },
    {
      id: ids.duskJob,
      status: "succeeded",
      createdAt: timestamp(now, 6),
      completedAt: timestamp(now, 5),
      prompt: DUSK_PROMPT,
      providerId: "iterlay-demo",
      providerName: "Iterlay 演示数据",
      model: "gpt-image-2",
      input: {
        workflowMode: "edit",
        useCase: "lighting-weather",
        promptSpec: promptSpec(DUSK_PROMPT, {
          inputImages: "AURA 灰色影棚原图",
          lightingMood: "深蓝暮色与温暖灯光",
          constraints: "仅修改背景、光线及由此产生的阴影和高光"
        }),
        prompt: DUSK_PROMPT,
        model: "gpt-image-2",
        size: "1024x1024",
        n: 1,
        quality: "high",
        style: "natural"
      },
      useCase: "lighting-weather",
      referenceImagePaths: [paths.studio],
      outputImagePaths: [paths.dusk],
      boardId
    },
    {
      id: ids.sageJob,
      status: "succeeded",
      createdAt: timestamp(now, 4),
      completedAt: timestamp(now, 3),
      prompt: SAGE_PROMPT,
      providerId: "iterlay-demo",
      providerName: "Iterlay 演示数据",
      model: "gpt-image-2",
      input: {
        workflowMode: "edit",
        useCase: "precise-object-edit",
        promptSpec: promptSpec(SAGE_PROMPT, {
          inputImages: "AURA 灰色影棚原图",
          colorPalette: "低饱和鼠尾草绿、银色、磨砂白、深炭灰",
          constraints: "仅修改背景、台面和按钮颜色"
        }),
        prompt: SAGE_PROMPT,
        model: "gpt-image-2",
        size: "1024x1024",
        n: 1,
        quality: "high",
        style: "natural"
      },
      useCase: "precise-object-edit",
      referenceImagePaths: [paths.studio, paths.moodboard],
      outputImagePaths: [paths.sage],
      boardId
    },
    {
      id: ids.contactSheetJob,
      status: "succeeded",
      createdAt: timestamp(now, 2),
      completedAt: timestamp(now, 1),
      prompt: CONTACT_SHEET_PROMPT,
      providerId: "iterlay-demo",
      providerName: "Iterlay 演示数据",
      model: "gpt-image-2",
      input: {
        workflowMode: "generate",
        useCase: "infographic-diagram",
        promptSpec: promptSpec(CONTACT_SHEET_PROMPT, {
          assetType: "产品视觉接触表",
          compositionFraming: "2×2 等分网格，画面铺满"
        }),
        prompt: CONTACT_SHEET_PROMPT,
        model: "gpt-image-2",
        size: "1024x1024",
        n: 1,
        quality: "high",
        style: "natural"
      },
      useCase: "infographic-diagram",
      referenceImagePaths: [paths.studio, paths.dusk, paths.sage, paths.moodboard],
      outputImagePaths: [paths.contactSheet],
      boardId
    }
  ];

  const nodes: BoardNodeSnapshot[] = [
    {
      id: ids.coverNode,
      imagePath: paths.cover,
      jobId: `${boardId}-cover-upload`,
      source: "upload",
      x: 0,
      y: 0,
      width: 1024,
      height: 1024
    },
    {
      id: ids.moodboardNode,
      imagePath: paths.moodboard,
      jobId: `${boardId}-moodboard-upload`,
      source: "upload",
      x: 304,
      y: 0,
      width: 1024,
      height: 1024
    },
    {
      id: ids.versionsNode,
      imagePath: paths.sage,
      jobId: ids.sageJob,
      source: "generated",
      x: 608,
      y: 0,
      width: 1024,
      height: 1024,
      versions: [
        { imagePath: paths.studio, jobId: ids.generateJob, width: 1024, height: 1024 },
        { imagePath: paths.dusk, jobId: ids.duskJob, width: 1024, height: 1024 },
        { imagePath: paths.sage, jobId: ids.sageJob, width: 1024, height: 1024 }
      ],
      activeVersion: 2
    },
    {
      id: ids.contactSheetNode,
      imagePath: paths.contactSheet,
      jobId: ids.contactSheetJob,
      source: "generated",
      x: 0,
      y: 304,
      width: 1024,
      height: 1024
    },
    {
      id: ids.studioSliceNode,
      imagePath: paths.studio,
      jobId: ids.contactSheetJob,
      source: "slice",
      x: 304,
      y: 304,
      width: 512,
      height: 512,
      derivation: {
        sourceNodeId: ids.contactSheetNode,
        sourceImagePath: paths.contactSheet,
        crop: { x: 0, y: 0, width: 512, height: 512 }
      }
    },
    {
      id: ids.duskSliceNode,
      imagePath: paths.dusk,
      jobId: ids.contactSheetJob,
      source: "slice",
      x: 608,
      y: 304,
      width: 512,
      height: 512,
      derivation: {
        sourceNodeId: ids.contactSheetNode,
        sourceImagePath: paths.contactSheet,
        crop: { x: 512, y: 0, width: 512, height: 512 }
      }
    }
  ];

  return {
    nodes,
    viewport: { x: 220, y: 76, zoom: 0.68 },
    jobs,
    comments: [
      {
        id: `${boardId}-comment-cover`,
        imagePath: paths.cover,
        text: "视觉方向已收敛：从材质情绪版出发，保留三种成片版本用于比较。",
        createdAt: timestamp(now, 2),
        position: { x: 0.3, y: 0.36 }
      },
      {
        id: `${boardId}-comment-sage`,
        imagePath: paths.sage,
        text: "v3 的鼠尾草背景更适合目录页，保留为主版本。",
        createdAt: timestamp(now, 1),
        position: { x: 0.72, y: 0.58 }
      }
    ],
    assetMeta: [
      { imagePath: paths.sage, favorite: true, tags: ["便携灯", "目录候选"] },
      { imagePath: paths.moodboard, favorite: false, tags: ["灵感参考", "材质"] },
      { imagePath: paths.contactSheet, favorite: false, tags: ["切图母图"] }
    ]
  };
}

export async function createInitialDemoBoard({
  assetsDirectory,
  assets,
  boards,
  history,
  comments,
  assetMeta,
  createThumbnailDataUrl = encodeJpegDataUrl
}: CreateInitialDemoBoardInput): Promise<BoardData> {
  const entries = await Promise.all(
    Object.entries(DEMO_ASSET_FILE_NAMES).map(async ([key, fileName]) => ({
      key: key as DemoAssetKey,
      fileName,
      bytes: await readFile(path.join(assetsDirectory, fileName))
    }))
  );
  const installed = await Promise.all(
    entries.map(async ({ key, fileName, bytes }) => ({
      key,
      filePath: await assets.saveImportedImage("initial-demo", fileName, bytes)
    }))
  );
  const paths = Object.fromEntries(installed.map(({ key, filePath }) => [key, filePath])) as DemoAssetPaths;
  const coverBytes = entries.find((entry) => entry.key === "cover")!.bytes;
  const thumbnailDataUrl = await createThumbnailDataUrl(coverBytes);
  const board = await boards.createBoard(INITIAL_DEMO_BOARD_NAME);
  const seed = buildInitialDemoBoardSeed(board.id, paths);
  const saved = await boards.saveBoard({
    id: board.id,
    name: INITIAL_DEMO_BOARD_NAME,
    nodes: seed.nodes,
    viewport: seed.viewport,
    thumbnailDataUrl
  });

  await Promise.all([
    history.importMany(seed.jobs),
    comments.importMany(seed.comments),
    assetMeta.importMany(seed.assetMeta)
  ]);
  return saved;
}

export async function ensureInitialDemoBoard(
  input: CreateInitialDemoBoardInput
): Promise<InitialDemoBoardInstallResult | null> {
  const installedVersion = await input.boards.getInstalledDemoBoardVersion();
  if (installedVersion >= INITIAL_DEMO_BOARD_VERSION) return null;

  const existingBoards = await input.boards.listBoards();
  const existingDemoBoard = existingBoards.find((board) => board.name === INITIAL_DEMO_BOARD_NAME);
  if (existingDemoBoard) {
    let board = existingDemoBoard;
    if (!board.thumbnailDataUrl) {
      const coverBytes = await readFile(path.join(input.assetsDirectory, DEMO_ASSET_FILE_NAMES.cover));
      const thumbnailDataUrl = await (input.createThumbnailDataUrl ?? encodeJpegDataUrl)(coverBytes);
      board = await input.boards.saveBoard({ id: board.id, thumbnailDataUrl });
    }
    await input.boards.setInstalledDemoBoardVersion(INITIAL_DEMO_BOARD_VERSION);
    return { board, created: false, isFirstBoard: false };
  }

  // 旧版本已经安装过但画板不存在，说明用户主动删除过；升级迁移不能把它恢复回来。
  if (installedVersion > 0) {
    await input.boards.setInstalledDemoBoardVersion(INITIAL_DEMO_BOARD_VERSION);
    return null;
  }

  const board = await createInitialDemoBoard(input);
  await input.boards.setInstalledDemoBoardVersion(INITIAL_DEMO_BOARD_VERSION);
  return { board, created: true, isFirstBoard: existingBoards.length === 0 };
}

function encodeJpegDataUrl(bytes: Buffer): string {
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}
