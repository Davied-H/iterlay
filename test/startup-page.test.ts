import { describe, expect, it } from "vitest";
import { buildStartupPage } from "../electron/startup-page";

describe("startup page", () => {
  it("renders the branded loading state without application dependencies", () => {
    const html = buildStartupPage({ dark: false });
    expect(html).toContain('role="status"');
    expect(html).toContain("Iterlay");
    expect(html.match(/class="layer/g)).toHaveLength(3);
    expect(html).toContain("background:#fafafa");
  });

  it("matches the dark BrowserWindow background", () => {
    const html = buildStartupPage({ dark: true });
    expect(html).toContain("color-scheme:dark");
    expect(html).toContain("background:#121212");
  });

  it("renders localized assistive loading copy", () => {
    const html = buildStartupPage({ dark: false, locale: "en-US" });
    expect(html).toContain('<html lang="en-US">');
    expect(html).toContain("Opening Iterlay");
    expect(html).not.toContain("正在打开");
  });
});
