import { describe, expect, it } from "vitest";
import {
  buildOnlineImageDetailSharePage,
  buildOnlineImageSharePage,
  ITERLAY_OFFICIAL_WEBSITE,
  ITERLAY_SHARE_WEBSITE
} from "../electron/image-share-page";

describe("online image share page", () => {
  it("renders a responsive prompt panel with references and Iterlay branding", () => {
    const page = buildOnlineImageSharePage({
      prompt: '<雨夜 & "霓虹">',
      referenceCount: 2,
      showPrompt: true
    });

    expect(page).toContain("&lt;雨夜 &amp; &quot;霓虹&quot;&gt;");
    expect(page).not.toContain('<雨夜 & "霓虹">');
    expect(page).toContain('src="references/1"');
    expect(page).toContain('src="references/2"');
    expect(page).toContain('href="references/1" target="_blank"');
    expect(page).toContain('href="references/1/download" download');
    expect(page).toContain('class="reference-download"');
    expect(page).toContain('src="brand-logo"');
    expect(page).toContain(ITERLAY_OFFICIAL_WEBSITE);
    expect(page).toContain(".prompt-panel");
    expect(page).toContain("@media (max-width: 720px)");
    expect(page).toContain("border-top: 1px solid #e2e5e3");
    expect(page).toContain(`href="${ITERLAY_SHARE_WEBSITE}"`);
    expect(page).toContain('id="use-in-iterlay"');
    expect(page).toContain('iterlay://import?source=');
  });

  it("omits generation details when prompt sharing is disabled", () => {
    const page = buildOnlineImageSharePage({
      prompt: "private prompt",
      referenceCount: 3,
      showPrompt: false
    });

    expect(page).not.toContain("private prompt");
    expect(page).not.toContain("创作提示词");
    expect(page).not.toContain('src="references/1"');
    expect(page).toContain("Iterlay");
    expect(page).toContain('src="image"');
  });

  it("renders a template-library style masonry collection with direct detail links", () => {
    const page = buildOnlineImageSharePage({
      prompt: "",
      referenceCount: 0,
      showPrompt: false,
      imageCount: 3
    });

    expect(page).toContain("共 3 张");
    expect(page).toContain('"src":"images/1"');
    expect(page).toContain('"src":"images/3"');
    expect(page).toContain(".image-grid");
    expect(page).toContain('"detailHref":"images/1/detail"');
    expect(page).toContain("查看详情");
    expect(page).toContain("data-share-masonry");
    expect(page).toContain("layoutMasonry");
    expect(page).toContain("正在加载图片 · 已加载 0 / 3 张");
    expect(page).toContain("Promise.all([worker(), worker()])");
    expect(page).toContain("attempt < 1");
    expect(page).toContain("@media (max-width: 520px)");
    expect(page).not.toContain('src="image"');
  });

  it("renders a standalone image detail page with generation details", () => {
    const page = buildOnlineImageDetailSharePage({
      imageNumber: 2,
      prompt: "为夏日活动设计商品主视觉",
      referenceCount: 2
    });

    expect(page).toContain("图片 2 · Iterlay");
    expect(page).toContain('src="../2"');
    expect(page).toContain("为夏日活动设计商品主视觉");
    expect(page).toContain('src="../2/references/2"');
    expect(page).toContain('href="../2/download" download');
    expect(page).toContain("返回全部图片");
  });
});
