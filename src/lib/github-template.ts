import { GITHUB_ISSUES_URL } from "./github-feedback";

/** The user attaches the archive and submits on GitHub; no files or prompts are uploaded here. */
export function buildGithubTemplateIssue(name: string): string {
  const url = new URL(`${GITHUB_ISSUES_URL}/new`);
  url.searchParams.set("title", `[模板投稿] ${Array.from(name.trim()).slice(0, 100).join("")}`);
  url.searchParams.set("body", [
    "### 模板介绍", "", name.trim().slice(0, 200), "",
    "请补充模板用途、使用方法和示例效果。", "",
    "### 模板附件", "",
    "请将 Iterlay 导出的 .itt 文件压缩为 ZIP，拖入这里上传附件。", "",
    "### 公开确认", "",
    "- [ ] 我已检查附件中的提示词和示例图，确认可以公开分享，并有权提供这些内容。"
  ].join("\n"));
  return url.href;
}
