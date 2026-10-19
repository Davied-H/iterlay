import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { parseBoardArchive } from "../electron/board-archive";
import { AGENT_STARTER, buildAgentStarterPrompt } from "../shared/agent-starter";
import { isBoardImageNode } from "../shared/types";

const starterDir = fileURLToPath(new URL("../website/public/examples/field/", import.meta.url));
const archivePath = path.join(starterDir, AGENT_STARTER.archiveFileName);

describe("public FIELD starter", () => {
  it("imports four original PNGs with the real orange-to-sage version chain and reference history", async () => {
    const parsed = await parseBoardArchive(await readFile(archivePath));
    const provenance = JSON.parse(await readFile(path.join(starterDir, "prompts.json"), "utf8")) as {
      assets: { file: string; jobId: string; prompt: string; originalArchivePath: string; originalSha256: string; reference: string | null }[];
    };
    expect(parsed.board.name).toBe(AGENT_STARTER.boardName);
    expect(parsed.images.size).toBe(4);
    expect(parsed.jobs).toHaveLength(4);
    const base = provenance.assets.find((asset) => asset.file === "field-studio.webp")!;
    const sage = provenance.assets.find((asset) => asset.file === "field-sage.webp")!;
    const nodes = parsed.board.nodes.filter(isBoardImageNode);
    expect(nodes).toHaveLength(4);
    const editedNode = nodes.find((node) => node.jobId === sage.jobId)!;
    expect(editedNode.activeVersion).toBe(1);
    expect(editedNode.versions?.map((version) => version.jobId)).toEqual([base.jobId, sage.jobId]);
    expect(editedNode.versions?.[0].imagePath).toBe(base.originalArchivePath);
    expect(editedNode.versions?.[1].imagePath).toBe(sage.originalArchivePath);
    for (const asset of provenance.assets) {
      const bytes = parsed.images.get(asset.originalArchivePath)!;
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(1254);
      expect(bytes.readUInt32BE(20)).toBe(1254);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.originalSha256);
      const job = parsed.jobs.find((job) => job.id === asset.jobId)!;
      expect(job.status).toBe("succeeded");
      expect(job.prompt).toBe(asset.prompt);
      expect(job.outputImagePaths).toEqual([asset.originalArchivePath]);
      expect(job.input.outputFormat).toBe("png");
      expect(job.input.size).toBe("1024x1024");
      expect(job.referenceImagePaths).toEqual(asset.reference ? [base.originalArchivePath] : []);
      expect(Date.parse(job.completedAt!)).toBeGreaterThan(Date.parse(job.createdAt));
    }
    const metadata = JSON.stringify({ board: parsed.board, jobs: parsed.jobs, provenance });
    expect(metadata).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\|api[_-]?key|access[_-]?token|"providerName"|"providerId"|https?:\/\//i);
  });

  it("ships a complete offline project and the identical importable archive in the download", async () => {
    const zip = new AdmZip(await readFile(path.join(starterDir, "field-starter.zip")));
    expect(zip.readFile(AGENT_STARTER.archiveFileName)).toEqual(await readFile(archivePath));
    const html = zip.readAsText("site/index.html");
    expect(html).toContain("FIELD — Sound, outside.");
    expect(html).not.toMatch(/(?:src|href)=["']https?:/);
    for (const asset of AGENT_STARTER.assets) {
      expect(zip.getEntry(`site/assets/${asset.file}`)).not.toBeNull();
      expect(html).toContain(asset.file);
    }
    expect(zip.getEntry("README.md")).not.toBeNull();
    expect(zip.getEntry("README.zh-CN.md")).not.toBeNull();
    expect(zip.getEntry("prompts.json")).not.toBeNull();
    const recording = zip.readFile("field-review.mp4")!;
    expect(recording.subarray(4, 8).toString()).toBe("ftyp");
    expect(zip.readAsText("README.md")).toContain("(field-review.mp4)");
    expect(zip.readAsText("README.zh-CN.md")).toContain("(field-review.mp4)");
    const capture = JSON.parse(zip.readAsText("field-review.provenance.json"));
    expect(capture.modelCalls).toBe(0);
    expect(capture.generationHistoryAfter).toBe(capture.generationHistoryBefore);
    expect(JSON.stringify(capture)).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
  });

  it("keeps first-run tasks explicit, avoids paid readiness probes and protects existing exports", () => {
    for (const agent of ["codex", "claude-code"] as const) {
      for (const language of ["zh", "en"] as const) {
        const check = buildAgentStarterPrompt(agent, language, "check");
        const create = buildAgentStarterPrompt(agent, language, "create");
        const deliver = buildAgentStarterPrompt(agent, language, "deliver");
        expect(deliver).toContain(language === "zh" ? "即使未配置 Provider，也继续导出" : "continue even if no provider is configured");
        expect(deliver).not.toContain(language === "zh" ? "没有可用图片服务时，引导我去模型设置" : "If no image provider is configured, guide me to model settings");
        for (const prompt of [check, create, deliver]) {
          expect(prompt.split("\n")[0]).toBe(agent === "codex" ? "$using-iterlay" : "/using-iterlay");
          expect(prompt).toContain("iterlay status --json");
          expect(prompt).toContain("--overwrite");
        }
        expect(check).not.toContain("iterlay image generate");
        expect(create).toContain("--n 1");
        expect(create).toContain("--request-id");
        expect(create).toContain("./public/iterlay-starter/hero.png");
        expect(create).toMatch(language === "zh" ? /确认之前不要提交生成/ : /Wait for my confirmation/);
        expect(deliver).toContain("iterlay assets export");
        expect(deliver).not.toContain("iterlay image generate");
        expect(deliver).not.toContain("iterlay boards import");
        for (const file of ["hero.png", "scene.png", "campaign.png"]) expect(deliver).toContain(file);
      }
    }
  });
});
