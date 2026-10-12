import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MasterGoReconstructionMode } from "../shared/mastergo-reconstruction.js";

const MAX_RECENT_OUTCOMES = 24;

export interface PiAgentEvolutionOutcome {
  mode: MasterGoReconstructionMode;
  strategy: "fidelity" | "balanced";
  outcome: "completed" | "failed";
  analysisRegionCount: number;
  localAssetCount: number;
  revisionCount: number;
  failureKind?: "validation" | "visual" | "connection" | "other";
}

interface PersistedEvolutionState {
  version: 1;
  outcomes: PiAgentEvolutionOutcome[];
}

export class PiAgentEvolutionStore {
  private readonly filePath: string;
  private outcomes: PiAgentEvolutionOutcome[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(directory: string) {
    this.filePath = path.join(directory, "pi-agent-evolution.json");
  }

  async start(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<PersistedEvolutionState>;
      if (parsed.version === 1 && Array.isArray(parsed.outcomes)) {
        this.outcomes = parsed.outcomes.filter(isOutcome).slice(-MAX_RECENT_OUTCOMES);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[pi-agent-evolution] 无法读取历史经验，将从空白经验库启动", error);
      }
    }
  }

  record(outcome: PiAgentEvolutionOutcome): void {
    this.outcomes = [...this.outcomes, sanitizeOutcome(outcome)].slice(-MAX_RECENT_OUTCOMES);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => writeFile(this.filePath, JSON.stringify({ version: 1, outcomes: this.outcomes }), "utf8"))
      .catch((error) => console.error("[pi-agent-evolution] 写入经验失败", error));
  }

  getGuidance(mode: MasterGoReconstructionMode, strategy: "fidelity" | "balanced"): string {
    const relevant = this.outcomes.filter((outcome) => outcome.mode === mode);
    if (relevant.length === 0) return "尚无同类任务经验：严格按当前参考图和 MasterGo 官方协议执行完整分析、提交和视觉复检。";

    const completed = relevant.filter((outcome) => outcome.outcome === "completed");
    const failed = relevant.filter((outcome) => outcome.outcome === "failed");
    const average = (field: "analysisRegionCount" | "localAssetCount" | "revisionCount", rows: PiAgentEvolutionOutcome[]) =>
      rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row[field], 0) / rows.length);
    const lessons = [
      `同类任务最近 ${relevant.length} 次中 ${completed.length} 次完成、${failed.length} 次未完成。`,
      completed.length > 0
        ? `已完成任务平均记录 ${average("analysisRegionCount", completed)} 个分析区域、${average("localAssetCount", completed)} 个本地素材，并进行了 ${average("revisionCount", completed)} 次视觉修正。`
        : "此前同类任务没有已核验完成记录，本次必须更审慎地逐步核验。"
    ];
    const validationFailures = failed.filter((outcome) => outcome.failureKind === "validation").length;
    const visualFailures = failed.filter((outcome) => outcome.failureKind === "visual").length;
    if (validationFailures > 0) lessons.push("历史上出现过结构或素材校验失败：提交前逐项核对坐标、素材路径、根节点尺寸和图层独立性。");
    if (visualFailures > 0 || average("revisionCount", relevant) >= 2) lessons.push("历史上视觉偏差较多：把最终截图逐区与当前原图对比，发现偏差后先修正再完成，不要提前确认。");
    if (strategy === "balanced" && completed.length > 0) lessons.push("当前选择易维护策略：只在当前截图中确有重复结构时复用，不能为了复用牺牲视觉对齐。");
    return lessons.join(" ");
  }

  async flush(): Promise<void> {
    await this.writeQueue.catch(() => undefined);
  }
}

function isOutcome(value: unknown): value is PiAgentEvolutionOutcome {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PiAgentEvolutionOutcome>;
  return (candidate.mode === "ui" || candidate.mode === "photo-layers")
    && (candidate.strategy === "fidelity" || candidate.strategy === "balanced")
    && (candidate.outcome === "completed" || candidate.outcome === "failed")
    && Number.isFinite(candidate.analysisRegionCount)
    && Number.isFinite(candidate.localAssetCount)
    && Number.isFinite(candidate.revisionCount);
}

function sanitizeOutcome(outcome: PiAgentEvolutionOutcome): PiAgentEvolutionOutcome {
  return {
    ...outcome,
    analysisRegionCount: clamp(outcome.analysisRegionCount, 0, 200),
    localAssetCount: clamp(outcome.localAssetCount, 0, 50),
    revisionCount: clamp(outcome.revisionCount, 0, 20)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
