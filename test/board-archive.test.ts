import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOARD_ARCHIVE_FORMAT,
  BOARD_ARCHIVE_VERSION,
  buildBoardArchive,
  parseBoardArchive
} from "../electron/board-archive";
import { isBoardImageNode, isBoardVideoNode, type BoardData, type GenerationJob, type VideoGenerationJob } from "../shared/types";

async function makeFixture(): Promise<{ board: BoardData; jobs: GenerationJob[] }> {
  const dir = await mkdtemp(path.join(tmpdir(), "irb-test-"));
  const imageA = path.join(dir, "job-1-1.png");
  const imageB = path.join(dir, "upload.png");
  await writeFile(imageA, Buffer.from("png-a"));
  await writeFile(imageB, Buffer.from("png-b"));

  const board: BoardData = {
    id: "board-1",
    name: "测试画板",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T01:00:00.000Z",
    viewport: { x: 10, y: 20, zoom: 0.8 },
    thumbnailDataUrl: "data:image/jpeg;base64,xxx",
    nodes: [
      { id: "prompt", type: "text", text: "一只青蛙", x: -300, y: 0 },
      { id: "generator", type: "generation", prompt: "电影感", x: -150, y: 0 },
      { id: "n1", imagePath: imageA, jobId: "job-1", source: "generated", x: 0, y: 0, width: 1024, height: 1024 },
      { id: "n2", imagePath: imageB, jobId: "upload-1", source: "upload", x: 300, y: 0 },
      { id: "n3", imagePath: path.join(dir, "missing.png"), jobId: "job-2", source: "generated", x: 600, y: 0 }
    ],
    connections: [{ id: "prompt-input", source: "prompt", target: "generator", kind: "reference" }]
  };
  const jobs: GenerationJob[] = [
    {
      id: "job-1",
      status: "succeeded",
      createdAt: "2026-07-14T00:30:00.000Z",
      prompt: "一只青蛙",
      input: { workflowMode: "generate", prompt: "一只青蛙", model: "gpt-5.5", size: "1024x1024", n: 1 },
      referenceImagePaths: [path.join(dir, "ref.png")],
      outputImagePaths: [imageA],
      boardId: "board-1"
    }
  ];
  return { board, jobs };
}

describe("board archive (.itb)", () => {
  it("keeps historical edit sources and semantic reference snapshots portable", async () => {
    const { board, jobs } = await makeFixture();
    const source = board.nodes.filter(isBoardImageNode)[1].imagePath;
    jobs[0].inputSnapshot = { version: 1, input: { ...jobs[0].input, workflowMode: "edit",
      editSource: { nodeId: "n2", imagePath: source, boardId: board.id } },
      references: [{ id: "source", name: "产品源图", mimeType: "image/png", role: "edit-target", semanticRole: "reference", sourceNodeId: "n2", path: source }] };
    const parsed = await parseBoardArchive(await buildBoardArchive(board, jobs, "0.1.1"));
    const snapshot = parsed.jobs[0].inputSnapshot!;
    expect(snapshot.references[0]).toMatchObject({ name: "产品源图", role: "edit-target", semanticRole: "reference", sourceNodeId: "n2" });
    expect(snapshot.references[0].path.startsWith("images/")).toBe(true);
    expect(snapshot.input.editSource?.imagePath).toBe(snapshot.references[0].path);
    expect(parsed.images.get(snapshot.references[0].path)?.toString()).toBe("png-b");
    expect(JSON.stringify(snapshot)).not.toContain(path.dirname(source));
  });

  it("round-trips board, history and images; drops nodes with missing files", async () => {
    const { board, jobs } = await makeFixture();
    const buffer = await buildBoardArchive(board, jobs, "0.1.1");
    const parsed = await parseBoardArchive(buffer);

    expect(parsed.manifest.format).toBe(BOARD_ARCHIVE_FORMAT);
    expect(parsed.manifest.formatVersion).toBe(BOARD_ARCHIVE_VERSION);
    expect(parsed.manifest.appVersion).toBe("0.1.1");

    // missing.png 的节点被剔除，其余节点 imagePath 改写为包内相对路径
    const imageNodes = parsed.board.nodes.filter(isBoardImageNode);
    expect(imageNodes).toHaveLength(2);
    expect(parsed.board.nodes.filter((node) => node.type === "text")).toMatchObject([
      { id: "prompt", text: "一只青蛙" }
    ]);
    expect(parsed.board.nodes.filter((node) => node.type === "generation")).toMatchObject([
      { id: "generator", prompt: "电影感" }
    ]);
    expect(parsed.board.connections).toMatchObject([
      { id: "prompt-input", source: "prompt", target: "generator", kind: "reference" }
    ]);
    for (const node of imageNodes) {
      expect(node.imagePath.startsWith("images/")).toBe(true);
      expect(parsed.images.has(node.imagePath)).toBe(true);
    }
    expect(parsed.board.viewport).toEqual(board.viewport);
    expect(parsed.board.thumbnailDataUrl).toBe(board.thumbnailDataUrl);

    // 历史路径不泄露本机绝对路径
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0].outputImagePaths[0]).toBe(imageNodes[0].imagePath);
    expect(parsed.jobs[0].referenceImagePaths[0]).toBe("ref.png");

    expect(parsed.images.get(imageNodes[0].imagePath)?.toString()).toBe("png-a");
  });

  it("deduplicates byte-identical files without changing the original image bytes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "itb-dedupe-test-"));
    const firstPath = path.join(dir, "first.png");
    const secondPath = path.join(dir, "second.png");
    const originalBytes = Buffer.from("byte-identical-original-image");
    await Promise.all([writeFile(firstPath, originalBytes), writeFile(secondPath, originalBytes)]);
    const board: BoardData = {
      id: "board-dedupe",
      name: "无损去重",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      nodes: [
        { id: "n1", imagePath: firstPath, jobId: "job-1", source: "generated", x: 0, y: 0 },
        { id: "n2", imagePath: secondPath, jobId: "job-2", source: "upload", x: 300, y: 0 }
      ]
    };

    const parsed = await parseBoardArchive(await buildBoardArchive(board, [], "0.1.6"));
    const imageNodes = parsed.board.nodes.filter(isBoardImageNode);

    expect(parsed.images.size).toBe(1);
    expect(imageNodes[0].imagePath).toBe(imageNodes[1].imagePath);
    expect(parsed.images.get(imageNodes[0].imagePath)).toEqual(originalBytes);
  });

  it("archives video, poster and video history without leaking absolute paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "itb-video-test-"));
    const videoPath = path.join(dir, "result.mp4");
    const posterPath = path.join(dir, "poster.jpg");
    const referencePath = path.join(dir, "reference.png");
    const firstFramePath = path.join(dir, "first-frame.png");
    const lastFramePath = path.join(dir, "last-frame.png");
    const sourceVideoPath = path.join(dir, "source.mp4");
    const referenceVideoPath = path.join(dir, "reference.mp4");
    const referenceAudioPath = path.join(dir, "reference.wav");
    await Promise.all([
      writeFile(videoPath, Buffer.from("video-bytes")),
      writeFile(posterPath, Buffer.from("poster-bytes")),
      writeFile(referencePath, Buffer.from("reference-bytes")),
      writeFile(firstFramePath, Buffer.from("first-frame-bytes")),
      writeFile(lastFramePath, Buffer.from("last-frame-bytes")),
      writeFile(sourceVideoPath, Buffer.from("source-video-bytes")),
      writeFile(referenceVideoPath, Buffer.from("reference-video-bytes")),
      writeFile(referenceAudioPath, Buffer.from("reference-audio-bytes"))
    ]);
    const board: BoardData = {
      id: "video-board",
      name: "视频画板",
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      nodes: [
        {
          id: "vg",
          type: "video-generation",
          mode: "remix",
          sourceVideoPath,
          referenceVideoPaths: [referenceVideoPath],
          referenceAudioPaths: [referenceAudioPath],
          targetVideoNodeId: "video",
          status: "completed",
          x: 0,
          y: 0
        },
        { id: "video", type: "video", videoPath, posterPath, jobId: "video-job", source: "generated", x: 380, y: 0 }
      ]
    };
    const videoJobs: VideoGenerationJob[] = [{
      id: "video-job",
      status: "completed",
      createdAt: "2026-08-11T00:00:00.000Z",
      completedAt: "2026-08-11T00:05:00.000Z",
      model: "video-model",
      input: {
        mode: "remix",
        prompt: "让画面动起来",
        model: "video-model",
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 5,
        referenceImagePaths: [referencePath],
        firstFramePath,
        lastFramePath,
        sourceVideoPath,
        referenceVideoPaths: [referenceVideoPath],
        referenceAudioPaths: [referenceAudioPath],
        targetVideoNodeId: "video",
        boardId: "video-board"
      },
      outputVideoPath: videoPath,
      outputPosterPath: posterPath
    }];

    const parsed = await parseBoardArchive(await buildBoardArchive(board, [], "0.2.0", [], [], videoJobs));
    const videoNode = parsed.board.nodes.find(isBoardVideoNode);
    const generationNode = parsed.board.nodes.find((node) => node.type === "video-generation");
    const serialized = JSON.stringify({ board: parsed.board, jobs: parsed.videoJobs });

    expect(videoNode?.videoPath).toMatch(/^videos\//);
    expect(videoNode?.posterPath).toMatch(/^posters\//);
    expect(parsed.media.get(videoNode!.videoPath)?.toString()).toBe("video-bytes");
    expect(parsed.media.get(videoNode!.posterPath!)?.toString()).toBe("poster-bytes");
    expect(parsed.videoJobs[0].input.referenceImagePaths[0]).toMatch(/^images\//);
    expect(parsed.videoJobs[0].input.firstFramePath).toMatch(/^images\//);
    expect(parsed.videoJobs[0].input.lastFramePath).toMatch(/^images\//);
    expect(parsed.images.get(parsed.videoJobs[0].input.firstFramePath!)?.toString()).toBe("first-frame-bytes");
    expect(parsed.images.get(parsed.videoJobs[0].input.lastFramePath!)?.toString()).toBe("last-frame-bytes");
    expect(parsed.videoJobs[0].input.sourceVideoPath).toMatch(/^videos\//);
    expect(parsed.videoJobs[0].input.referenceVideoPaths?.[0]).toMatch(/^videos\//);
    expect(parsed.videoJobs[0].input.referenceAudioPaths?.[0]).toMatch(/^audios\//);
    expect(parsed.media.get(parsed.videoJobs[0].input.sourceVideoPath!)?.toString()).toBe("source-video-bytes");
    expect(parsed.media.get(parsed.videoJobs[0].input.referenceAudioPaths![0])?.toString()).toBe("reference-audio-bytes");
    expect(generationNode).toMatchObject({
      mode: "remix",
      sourceVideoPath: parsed.videoJobs[0].input.sourceVideoPath,
      referenceVideoPaths: parsed.videoJobs[0].input.referenceVideoPaths,
      referenceAudioPaths: parsed.videoJobs[0].input.referenceAudioPaths,
      targetVideoNodeId: "video"
    });
    expect(serialized).not.toContain(dir);
  });

  it("rejects non-zip data with a readable error", async () => {
    await expect(parseBoardArchive(Buffer.from("not a zip"))).rejects.toThrow(/无法按 zip 解压/);
  });

  it("rejects archives with a newer format version", async () => {
    const { board, jobs } = await makeFixture();
    const buffer = await buildBoardArchive(board, jobs, "0.1.1");
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    zip.updateFile(
      "manifest.json",
      Buffer.from(JSON.stringify({ format: BOARD_ARCHIVE_FORMAT, formatVersion: BOARD_ARCHIVE_VERSION + 1 }))
    );
    await expect(parseBoardArchive(zip.toBuffer())).rejects.toThrow(/版本过高/);
  });

  it("imports legacy ImageRelay archives", async () => {
    const { board, jobs } = await makeFixture();
    const buffer = await buildBoardArchive(board, jobs, "0.1.1");
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const manifest = JSON.parse(zip.readAsText("manifest.json")) as Record<string, unknown>;
    zip.updateFile(
      "manifest.json",
      Buffer.from(JSON.stringify({ ...manifest, format: "image-relay-board" }))
    );

    const parsed = await parseBoardArchive(zip.toBuffer());
    expect(parsed.manifest.format).toBe("image-relay-board");
    expect(parsed.board.nodes).toHaveLength(4);
  });

  it("rejects archives that are not Iterlay boards", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({ format: "other", formatVersion: 1 })));
    await expect(parseBoardArchive(zip.toBuffer())).rejects.toThrow(/不是 Iterlay 画板/);
  });

  it("rejects unsafe archive entry paths", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({ format: BOARD_ARCHIVE_FORMAT, formatVersion: 1 })));
    zip.addFile("outside.png", Buffer.from("bad"));
    zip.getEntry("outside.png")!.entryName = "../outside.png";
    await expect(parseBoardArchive(zip.toBuffer())).rejects.toThrow(/不安全的文件路径/);
  });
});
