import type { FeedbackKind } from "@shared/feedback";
import { version } from "../../package.json";

export const GITHUB_ISSUES_URL = "https://github.com/Davied-H/iterlay/issues";
const MAX_ISSUE_URL_LENGTH = 7_500;
const kindLabels: Record<FeedbackKind, string> = {
  experience: "体验问题",
  feature: "功能建议",
  other: "反馈"
};

/** Only include the user's feedback and basic UI diagnostics in public issues. */
export function buildGithubFeedbackIssue(input: {
  kind: FeedbackKind;
  content: string;
  view: string;
  viewport: string;
  locale: string;
}): { url: string; body: string; requiresPaste: boolean } {
  const content = input.content.trim();
  const title = `[${kindLabels[input.kind]}] ${Array.from(content.split(/\r?\n/u)[0]).slice(0, 70).join("")}`;
  const context = [
    "### 使用环境",
    `- Iterlay: ${version}`,
    `- 界面: ${input.view}`,
    `- 窗口: ${input.viewport}`,
    `- 语言: ${input.locale}`
  ].join("\n");
  const body = `### 反馈内容\n\n${content}\n\n${context}`;
  const url = new URL(`${GITHUB_ISSUES_URL}/new`);
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  const requiresPaste = url.href.length > MAX_ISSUE_URL_LENGTH;
  if (requiresPaste) url.searchParams.set("body", "请将已复制的完整反馈粘贴到这里。\n");
  return { url: url.href, body, requiresPaste };
}
