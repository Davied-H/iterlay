import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";
import { exportLogArchive, redactLog, RuntimeLog } from "../electron/runtime-log";

const directories: string[] = [];
async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "iterlay-logs-"));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runtime logs", () => {
  it("redacts common credentials and embedded media", () => {
    expect(redactLog('Bearer abc.def apiKey=secret {"password":"hidden"} token=private data:image/png;base64,YWJj'))
      .toBe('Bearer [REDACTED] apiKey=[REDACTED] {"password":[REDACTED]} token=[REDACTED] [MEDIA OMITTED]');
  });

  it("persists messages, errors and earlier sessions", async () => {
    const directory = await temporaryDirectory();
    const first = new RuntimeLog(directory);
    first.record("main", "info", "first session");
    await first.flush();
    const logger = new RuntimeLog(directory);
    logger.record("renderer:1", "error", new Error("second session"));
    await logger.flush();
    const content = await readFile(logger.filePath, "utf8");
    expect(content).toContain("[main] [info] first session");
    expect(content).toContain("[renderer:1] [error] Error: second session");
    expect(content).toContain("runtime-log.test.ts");
  });

  it("rotates logs and includes retained files but not unrelated private files", async () => {
    const directory = await temporaryDirectory();
    const logger = new RuntimeLog(directory, 100);
    for (let index = 0; index < 10; index++) logger.record("main", "info", "x".repeat(100), index);
    await logger.flush();
    await writeFile(path.join(directory, "pi-agent.jsonl"), '{"summary":"agent","token":"private"}');
    await writeFile(path.join(directory, "settings.json"), "PRIVATE SETTINGS");
    const destination = path.join(directory, "export.zip");
    await exportLogArchive(directory, destination, { appVersion: "test" });
    const zip = new AdmZip(destination);
    expect(zip.getEntries().map((entry) => entry.entryName).sort()).toEqual([
      "manifest.json", "pi-agent.jsonl", "runtime.log", "runtime.log.1",
      "runtime.log.2", "runtime.log.3", "runtime.log.4", "runtime.log.5"
    ]);
    expect(zip.readAsText("runtime.log")).toContain("9");
    expect(zip.readAsText("pi-agent.jsonl")).not.toContain("private");
    expect(JSON.parse(zip.readAsText("manifest.json"))).toMatchObject({ appVersion: "test" });
  });

  it("reports export write failures", async () => {
    const directory = await temporaryDirectory();
    await expect(exportLogArchive(directory, path.join(directory, "missing", "logs.zip"), {})).rejects.toThrow();
  });
});
