import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { localizeLegacyText } from "../src/i18n/legacy-messages";
import { workbenchEnglish } from "../src/i18n/workbench-messages";

const chinese = /[\u4e00-\u9fff]/u;

describe("English UI coverage", () => {
  it("covers Chinese literals passed to UI translators in production components", () => {
    const missing: string[] = [];
    function walk(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!["dev", "i18n"].includes(entry.name)) walk(file);
          continue;
        }
        if (!/\.tsx?$/u.test(file)) continue;
        const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
        function inspectLiteral(node: ts.Node): void {
          if (ts.isStringLiteral(node) && chinese.test(node.text) && node.text !== "简体中文"
            && chinese.test(localizeLegacyText(node.text, "en-US"))) {
            missing.push(`${file}: ${node.text}`);
          }
          ts.forEachChild(node, inspectLiteral);
        }
        function visit(node: ts.Node): void {
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
            && ["uiText", "translateSourceText"].includes(node.expression.text) && node.arguments[0]) {
            inspectLiteral(node.arguments[0]);
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
    walk(path.resolve("src"));
    walk(path.resolve("plugins"));
    expect(missing).toEqual([]);
  });

  it("preserves interpolation tokens in every supplemental translation", () => {
    for (const [source, translated] of Object.entries(workbenchEnglish)) {
      const tokens = (value: string): string[] => [...value.matchAll(/\{\{ui:\d+\}\}/gu)].map(([token]) => token).sort();
      expect(tokens(translated), source).toEqual(tokens(source));
      expect(translated.trim(), source).not.toBe("");
      expect(chinese.test(translated), source).toBe(false);
    }
  });
});
