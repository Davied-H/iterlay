import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface PackageBuildConfig {
  electronLanguages?: string[];
  mac?: { electronLanguages?: string[] };
  win?: { electronLanguages?: string[] };
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { build: PackageBuildConfig };

describe("desktop package config", () => {
  it("uses each platform's native Electron locale names", () => {
    expect(packageJson.build.electronLanguages).toBeUndefined();
    expect(packageJson.build.mac?.electronLanguages).toEqual(["en", "zh_CN"]);
    expect(packageJson.build.win?.electronLanguages).toEqual(["en-US", "zh-CN"]);
  });
});
