import { describe, expect, it } from "vitest";
import { buildGithubTemplateIssue } from "../src/lib/github-template";

describe("GitHub template contributions", () => {
  it("prepares a public issue draft with attachment instructions, without submitting anything", () => {
    const url = new URL(buildGithubTemplateIssue("海报 & 产品 / 模板"));
    expect(url.origin + url.pathname).toBe("https://github.com/Davied-H/iterlay/issues/new");
    expect(url.searchParams.get("title")).toBe("[模板投稿] 海报 & 产品 / 模板");
    expect(url.searchParams.get("body")).toContain("压缩为 ZIP");
    expect(url.searchParams.get("body")).toContain("公开分享");
    expect(url.searchParams.has("archiveBase64")).toBe(false);
  });

  it("bounds issue URLs even for unusually long template names", () => {
    const url = new URL(buildGithubTemplateIssue("模板".repeat(10_000)));
    expect(url.href.length).toBeLessThan(7_500);
    expect(url.searchParams.get("title")?.length).toBeLessThanOrEqual(107);
  });
});
