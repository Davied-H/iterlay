import { describe, expect, it } from "vitest";
import { resolveCreateChatMediaType } from "../src/lib/create-chat-media";

describe("creation deliverable routing", () => {
  it("keeps video intent as a fallback when the model omits the classification", () => {
    const conversation = [{ role: "user" as const, content: "帮我生成一个咖啡短视频" }];
    expect(resolveCreateChatMediaType(conversation, "5秒，竖屏")).toBe("video");
  });
  it("distinguishes a video cover and an explicit switch to a still image", () => {
    expect(resolveCreateChatMediaType([], "帮我生成一张视频封面")).toBe("image");
    expect(resolveCreateChatMediaType([{ role: "user", content: "做一段视频" }], "改成一张图片")).toBe("image");
  });
  it("trusts the model interpretation rather than overriding it with historical keywords", () => {
    expect(resolveCreateChatMediaType([{ role: "user", content: "之前做过视频" }], "这次照你的建议", "image")).toBe("image");
    expect(resolveCreateChatMediaType([], "做个动画分镜参考", "image")).toBe("image");
    expect(resolveCreateChatMediaType([], "清晨海面的缓慢推进镜头", "video")).toBe("video");
    expect(resolveCreateChatMediaType([], "香水产品摄影")).toBe("image");
  });
});
