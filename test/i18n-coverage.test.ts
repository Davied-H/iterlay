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

  it("rejects untranslated inline UI literals and native accessibility labels", () => {
    const missing: string[] = [];
    function walk(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          // The Remotion reel contains example artwork and sample project content.
          if (!["dev", "i18n", "remotion"].includes(entry.name)) walk(file);
          continue;
        }
        if (!file.endsWith(".tsx")) continue;
        const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
        function visit(node: ts.Node): void {
          if (ts.isJsxText(node) && chinese.test(node.text)) missing.push(`${file}: ${node.text.trim()}`);
          if (ts.isStringLiteral(node) && chinese.test(node.text)) {
            let parent: ts.Node | undefined = node.parent;
            while (parent) {
              if (ts.isCallExpression(parent) || ts.isVariableDeclaration(parent) || ts.isFunctionLike(parent) || ts.isTemplateExpression(parent)) break;
              // A state discriminator in a JSX condition is not rendered UI.
              // Keep inspecting both rendered branches for untranslated copy.
              if (ts.isConditionalExpression(parent) && node.pos >= parent.condition.pos && node.end <= parent.condition.end) break;
              // Explicit bilingual branches already select their localized copy.
              if (ts.isConditionalExpression(parent) && parent.condition.getText(source).includes("locale")) break;
              if (ts.isJsxExpression(parent)) { missing.push(`${file}: ${node.text}`); break; }
              if (ts.isJsxAttribute(parent) && ["aria-label", "title", "placeholder", "alt"].includes(parent.name.getText(source))) {
                const opening = parent.parent.parent;
                if ((ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) && /^[a-z]/u.test(opening.tagName.getText(source))) missing.push(`${file}: ${node.text}`);
                break;
              }
              parent = parent.parent;
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
    walk(path.resolve("src"));
    expect(missing).toEqual([]);
  });

  it("covers app-owned copy stored in UI data tables", () => {
    const tables: Record<string, string[]> = {
      "src/components/canvas/CanvasShortcutHelpDialog.tsx": ["groups"],
      "src/components/canvas/CanvasToolHint.tsx": ["CANVAS_TOOL_HINTS"],
      "src/components/onboarding/tours.ts": ["BOARD_TOUR", "LIBRARY_TOUR", "GALLERY_TOUR", "EDIT_TOUR"],
      "src/components/onboarding/WelcomeTourStep.tsx": ["OPENING_LINES", "CORE_DEMO_NARRATION", "MORE_DEMO_NARRATION"],
      "src/components/feedback/FeedbackWidget.tsx": ["kindOptions", "kindPlaceholders", "feedbackNudges"],
      "src/components/workbench/ProviderSettingsDialog.tsx": ["boardPages"],
      "src/components/workbench/gallery/GalleryModeSwitcher.tsx": ["MODES"]
    };
    const missing: string[] = [];
    for (const [file, names] of Object.entries(tables)) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function inspect(node: ts.Node): void {
        if (ts.isStringLiteral(node) && chinese.test(node.text) && chinese.test(localizeLegacyText(node.text, "en-US"))) missing.push(`${file}: ${node.text}`);
        ts.forEachChild(node, inspect);
      }
      function visit(node: ts.Node): void {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text) && node.initializer) inspect(node.initializer);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
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
