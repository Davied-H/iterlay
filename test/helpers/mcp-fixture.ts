import { vi } from "vitest";
import { WORKBENCH_COMMANDS } from "../../shared/contracts/workbench-commands";
import { McpCommands } from "../../electron/application/mcp-commands";
import type { McpWorkbenchApi } from "../../electron/application/workbench-api";
export function mcpFixture() {
  const mocks = Object.fromEntries(Object.keys(WORKBENCH_COMMANDS).map((name) => [name, vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined)]));
  mocks.getSettings.mockResolvedValue({ activeProviderId: "custom", providers: [{ id: "custom", type: "openai-compatible", model: "fixture" }] });
  mocks.getBoard.mockResolvedValue({ id: "board", nodes: [{ id: "image", imagePath: "/managed/source.png", x: 0, y: 0 }], revision: 1 });
  mocks.getBoardsState.mockResolvedValue({ lastOpenedBoardId: "board" });
  mocks.generateImage.mockResolvedValue({
    job: { id: "job", providerId: "custom", status: "succeeded", outputImagePaths: ["/managed/result.png"] },
    images: [{ path: "/managed/result.png", dataUrl: "iterlay-asset://output" }], warnings: []
  });
  mocks.readAssetDataUrl.mockResolvedValue("data:image/png;base64,AA==");
  mocks.listHistory.mockResolvedValue([]);
  mocks.listBoards.mockResolvedValue([{ id: "board" }]);
  mocks.appendBoardNodes.mockResolvedValue({ ok: true });
  const emit = vi.fn(), flush = vi.fn(async () => undefined);
  const commands = new McpCommands({ api: mocks as unknown as McpWorkbenchApi, emit, flush });
  return { mocks, emit, flush, commands };
}
