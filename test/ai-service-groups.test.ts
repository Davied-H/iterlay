import { describe, expect, it } from "vitest";
import type { ProviderConfig, TextProviderConfig } from "../shared/types";
import { groupAiServices } from "../src/lib/ai-service-groups";

function imageProvider(partial: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "image",
    name: "图片服务",
    type: "openai-compatible",
    apiMode: "responses",
    baseUrl: "https://api.example.com",
    generationEndpoint: "/v1/responses",
    model: "gpt-image-2",
    supportsReferenceImages: true,
    ...partial
  };
}

function textProvider(partial: Partial<TextProviderConfig>): TextProviderConfig {
  return {
    id: "text",
    name: "文本服务",
    type: "openai-compatible",
    baseUrl: "https://api.example.com",
    model: "gpt-5.5",
    ...partial
  };
}

describe("AI service groups", () => {
  it("merges OpenAI-compatible capabilities that use the same Base URL", () => {
    const groups = groupAiServices(
      [imageProvider({ baseUrl: "https://api.example.com/" })],
      [textProvider({ baseUrl: "https://api.example.com" })]
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "image:image",
      imageProvider: { id: "image" },
      textProvider: { id: "text" }
    });
  });

  it("merges official capabilities and linked Codex capabilities", () => {
    const groups = groupAiServices(
      [
        imageProvider({ id: "official-image", type: "official", baseUrl: "" }),
        imageProvider({ id: "codex-image", type: "codex-oauth", baseUrl: "" })
      ],
      [
        textProvider({ id: "official-text", type: "official", baseUrl: "" }),
        textProvider({ id: "codex-text", type: "codex-oauth", authProviderId: "codex-image", baseUrl: "" })
      ]
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].textProvider?.id).toBe("official-text");
    expect(groups[1].textProvider?.id).toBe("codex-text");
  });

  it("keeps unrelated image and text connections separate", () => {
    const groups = groupAiServices(
      [imageProvider({ baseUrl: "https://image.example.com" })],
      [textProvider({ baseUrl: "https://text.example.com" })]
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].textProvider).toBeUndefined();
    expect(groups[1].imageProvider).toBeUndefined();
  });

  it("does not merge ambiguous accounts on the same Base URL", () => {
    const groups = groupAiServices(
      [
        imageProvider({ id: "image-a", name: "账号 A" }),
        imageProvider({ id: "image-b", name: "账号 B" })
      ],
      [textProvider({ id: "text-c", name: "账号 C" })]
    );

    expect(groups).toHaveLength(3);
    expect(groups.every((group) => !(group.imageProvider && group.textProvider))).toBe(true);
  });
});
