export type McpClientId = "codex" | "claude-code";

export interface McpSkillUpgradeDetail {
  client: McpClientId;
  skillPath: string;
  previousDigest?: string;
  currentDigest: string;
  upgradedAt: string;
  files: {
    added: string[];
    updated: string[];
    removed: string[];
  };
}
