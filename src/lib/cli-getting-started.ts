import type { CodingAgentId, CodingAgentIntegrationStatus } from "@shared/agent-integration";
import type { BoardSummary } from "@shared/types";

export const CODING_AGENT_NAMES: Record<CodingAgentId, string> = {
  codex: "Codex", "claude-code": "Claude Code", workbuddy: "WorkBuddy", cursor: "Cursor",
  windsurf: "Windsurf", cline: "Cline", "roo-cline": "Roo Code", "gemini-cli": "Gemini CLI", opencode: "OpenCode"
};

export function resolveCliDestination(boards: BoardSummary[], configuredId?: string): {
  board: BoardSummary | undefined;
  missing: boolean;
} {
  const board = configuredId ? boards.find((item) => item.id === configuredId) : boards.find((item) => item.name === "CLI 创作");
  return { board, missing: Boolean(configuredId && !board) };
}

/** A missing PATH still permits a copyable command using the installed launcher. */
export function cliGuideExecutable(cli?: CodingAgentIntegrationStatus["cli"], fullPath = false): string {
  if (!cli?.path || (!fullPath && (!cli.installed || cli.pathConfigured))) return "iterlay";
  return /\.cmd$/iu.test(cli.path)
    ? `& '${cli.path.replaceAll("'", "''")}'`
    : `'${cli.path.replaceAll("'", "'\\''")}'`;
}

export function buildCliGuideCommands(cli: CodingAgentIntegrationStatus["cli"] | undefined, english: boolean, development = false): {
  status: string;
  generate: string;
  providers: string;
  help: string;
} {
  const executable = cliGuideExecutable(cli, development);
  const prompt = english ? "Minimalist coffee cup illustration" : "极简咖啡杯插画";
  return {
    status: `${executable} status --json`,
    providers: `${executable} providers list --kind image --json`,
    help: `${executable} help`,
    generate: `${executable} image generate --prompt "${prompt}" --n 1 --out ./cup.png`
  };
}
