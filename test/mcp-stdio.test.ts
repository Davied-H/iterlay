import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { whenReady: vi.fn(), getPath: vi.fn() }, shell: { openExternal: vi.fn() } }));

import { buildToolContent } from "../electron/mcp-stdio.js";

describe("MCP image tool responses", () => {
  it("returns generated images as MCP image content and omits transient data URLs from text", () => {
    const content = buildToolContent({
      job: { id: "job-1", status: "succeeded" },
      mcpImageDataUrls: ["data:image/png;base64,aGVsbG8="]
    });

    expect(content).toEqual([
      { type: "text", text: JSON.stringify({ job: { id: "job-1", status: "succeeded" } }) },
      { type: "image", mimeType: "image/png", data: "aGVsbG8=" }
    ]);
  });

  it("does not return oversized or malformed image payloads", () => {
    const content = buildToolContent({
      mcpImageDataUrls: ["data:text/plain;base64,aGVsbG8=", "data:image/png;base64,not base64"]
    });

    expect(content).toEqual([{ type: "text", text: "{}" }]);
  });
});
