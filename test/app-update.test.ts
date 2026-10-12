import { describe, expect, it } from "vitest";
import {
  compareVersions,
  evaluateUpdateManifest,
  isUpdateManifest,
  parseVersion,
  type UpdateManifest
} from "../shared/app-update.js";

function manifest(overrides: Partial<UpdateManifest> = {}): UpdateManifest {
  return {
    version: "0.2.0",
    platform: "darwin",
    downloadUrl: "https://example.com/Iterlay-0.2.0-arm64.dmg",
    ...overrides
  };
}

describe("compareVersions", () => {
  it("compares major/minor/patch numerically", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.1.6")).toBe(1);
    expect(compareVersions("0.1.6", "0.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("treats missing segments as zero and ignores a v prefix", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("v1.3.0", "1.2.9")).toBe(1);
  });

  it("ranks release builds above prereleases and orders prerelease segments", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0-beta.2")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.2")).toBe(0);
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
  });

  it("treats unparseable versions as the lowest version", () => {
    expect(parseVersion("not-a-version")).toBeNull();
    expect(compareVersions("not-a-version", "0.0.1")).toBe(-1);
    expect(compareVersions("0.0.1", "not-a-version")).toBe(1);
    expect(compareVersions("bad", "also-bad")).toBe(0);
  });
});

describe("isUpdateManifest", () => {
  it("accepts a minimal valid manifest", () => {
    expect(isUpdateManifest(manifest())).toBe(true);
  });

  it("rejects payloads with missing or malformed required fields", () => {
    expect(isUpdateManifest(null)).toBe(false);
    expect(isUpdateManifest({})).toBe(false);
    expect(isUpdateManifest(manifest({ version: "oops" }))).toBe(false);
    expect(isUpdateManifest({ ...manifest(), platform: "linux" })).toBe(false);
    expect(isUpdateManifest({ ...manifest(), channel: "nightly" })).toBe(false);
    expect(isUpdateManifest(manifest({ downloadUrl: "ftp://example.com/a.dmg" }))).toBe(false);
    expect(isUpdateManifest({ ...manifest(), forced: "yes" })).toBe(false);
    expect(isUpdateManifest({ ...manifest(), minSupportedVersion: "latest" })).toBe(false);
  });
});

describe("evaluateUpdateManifest", () => {
  it("reports up-to-date when there is no manifest or the manifest is not newer", () => {
    expect(evaluateUpdateManifest("0.1.6", null).availability).toBe("up-to-date");
    expect(evaluateUpdateManifest("0.2.0", manifest()).availability).toBe("up-to-date");
    expect(evaluateUpdateManifest("0.3.0", manifest()).availability).toBe("up-to-date");
  });

  it("reports available for a newer optional release", () => {
    const evaluation = evaluateUpdateManifest("0.1.6", manifest());
    expect(evaluation.availability).toBe("available");
    expect(evaluation.manifest?.version).toBe("0.2.0");
  });

  it("forces the update when the backend marks it forced", () => {
    expect(evaluateUpdateManifest("0.1.6", manifest({ forced: true })).availability).toBe("forced");
  });

  it("forces the update when the current version is below minSupportedVersion", () => {
    expect(
      evaluateUpdateManifest("0.1.6", manifest({ minSupportedVersion: "0.1.7" })).availability
    ).toBe("forced");
    expect(
      evaluateUpdateManifest("0.1.7", manifest({ minSupportedVersion: "0.1.7" })).availability
    ).toBe("available");
  });

  it("ignores an unparseable minSupportedVersion", () => {
    expect(
      evaluateUpdateManifest("0.1.6", manifest({ minSupportedVersion: "latest" })).availability
    ).toBe("available");
  });

  it("keeps beta updates optional even when stable-only policy fields are present", () => {
    const evaluation = evaluateUpdateManifest(
      "0.2.0-beta.1",
      manifest({ version: "0.2.0-beta.2", channel: "beta", forced: true, minSupportedVersion: "0.3.0" })
    );
    expect(evaluation.availability).toBe("available");
    expect(evaluation.manifest?.version).toBe("0.2.0-beta.2");
  });
});
