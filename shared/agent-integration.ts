export type CodingAgentId = "codex" | "claude-code";

export interface AgentSkillUpgradeDetail {
  client: CodingAgentId;
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

export interface CodingAgentStatus {
  id: CodingAgentId;
  detected: boolean;
  detection: "installed" | "config-only" | "not-found";
  executablePath?: string;
  skillInstalled: boolean;
  skillManaged: boolean;
  skillPath: string;
  legacyConfigured: boolean;
}
export interface CodingAgentIntegrationStatus {
  clients: CodingAgentStatus[];
  cli: { installed: boolean; path: string; pathConfigured: boolean; error?: string };
  development: boolean;
}
