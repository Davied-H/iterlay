import { describe, expect, it } from "vitest";
import { buildCliGuideCommands, cliGuideExecutable, resolveCliDestination } from "../src/lib/cli-getting-started";
import type { BoardSummary } from "../shared/types";

const boards: BoardSummary[] = [
  { id: "automatic", name: "CLI 创作", createdAt: "", updatedAt: "", imageCount: 0 },
  { id: "chosen", name: "产品摄影", createdAt: "", updatedAt: "", imageCount: 0 }
];

describe("CLI getting-started commands and destination", () => {
  it("uses the configured board and never falls back after it is deleted", () => {
    expect(resolveCliDestination(boards, "chosen").board?.name).toBe("产品摄影");
    expect(resolveCliDestination(boards, "deleted")).toEqual({ board: undefined, missing: true });
    expect(resolveCliDestination(boards).board?.id).toBe("automatic");
    expect(resolveCliDestination([])).toEqual({ board: undefined, missing: false });
  });

  it("quotes a POSIX launcher containing spaces and an apostrophe when PATH is unavailable", () => {
    const cli = { installed: true, pathConfigured: false, path: "/Users/Ada's Workspace/bin/iterlay" };
    expect(cliGuideExecutable(cli)).toBe("'/Users/Ada'\\''s Workspace/bin/iterlay'");
    const commands = buildCliGuideCommands(cli, false);
    expect(Object.values(commands).every((command) => command.startsWith(cliGuideExecutable(cli)))).toBe(true);
    expect(commands.generate).toContain('--prompt "极简咖啡杯插画" --n 1 --out ./cup.png');
  });

  it("uses a PowerShell invocation for Windows without introducing POSIX line continuation", () => {
    const cli = { installed: true, pathConfigured: false, path: "C:\\Users\\Ada's Space\\iterlay.cmd" };
    const command = buildCliGuideCommands(cli, true).generate;
    expect(command).toBe('& \'C:\\Users\\Ada\'\'s Space\\iterlay.cmd\' image generate --prompt "Minimalist coffee cup illustration" --n 1 --out ./cup.png');
    expect(command).not.toContain("\n");
  });

  it("keeps installed commands short when PATH is ready and missing installs actionable", () => {
    expect(cliGuideExecutable({ installed: true, pathConfigured: true, path: "/bin/iterlay" })).toBe("iterlay");
    expect(cliGuideExecutable({ installed: false, pathConfigured: false, path: "/bin/iterlay" })).toBe("iterlay");
  });

  it("keeps development commands bound to the isolated launcher even when a global CLI is present", () => {
    const cli = { installed: true, pathConfigured: true, path: "/test/agent-home/.local/bin/iterlay" };
    expect(buildCliGuideCommands(cli, false, true).status).toBe("'/test/agent-home/.local/bin/iterlay' status --json");
    expect(buildCliGuideCommands({ ...cli, installed: false }, false, true).status).toBe("'/test/agent-home/.local/bin/iterlay' status --json");
  });
});
