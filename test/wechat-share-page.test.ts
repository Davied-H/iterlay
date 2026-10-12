import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertDownloadChildPath, buildWechatMobileSharePage } from "../electron/wechat-share-page";

describe("wechat mobile share page", () => {
  it("only accepts paths below the configured download directory", () => {
    const root = path.resolve("/Users/test/Downloads");
    expect(assertDownloadChildPath(root, path.join(root, "stickers", "01.png"))).toBe(
      path.join(root, "stickers", "01.png")
    );
    expect(() => assertDownloadChildPath(root, root)).toThrow(/微信表情文件夹/);
    expect(() => assertDownloadChildPath(root, "/Users/test/private.png")).toThrow(/下载目录/);
  });

  it("renders every sticker, escapes package text, and explains the real WeChat import path", () => {
    const page = buildWechatMobileSharePage({
      packageName: '<测试 & "表情">',
      stickerNames: ["01.png", "动图 02.gif"],
      hasZip: true
    });
    expect(page).toContain("&lt;测试 &amp; &quot;表情&quot;&gt;");
    expect(page).not.toContain('<测试 & "表情">');
    expect(page).toContain("stickers/01.png");
    expect(page).toContain("stickers/%E5%8A%A8%E5%9B%BE%2002.gif");
    expect(page).toContain('href="package.zip"');
    expect(page).toContain("添加的单个表情");
    expect(page).toContain("长按图片，保存或分享");
    expect(page).toContain("长按任一表情");
    expect(page).toContain("保存图片");
    expect(page).toContain("不能把 ZIP 直接安装成表情包");
    expect(page).toContain("navigator.share");
  });
});
