// @vitest-environment jsdom
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { GenerateActionButton } from "../src/components/workbench/GenerateActionButton";
import { I18nProvider, useI18n } from "../src/i18n";
import { loadUiTextCatalog } from "../src/i18n/ui-text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => localStorage.clear());

describe("generation action localization", () => {
  it("loads English on a cold start and switches live without changing the supplied action", async () => {
    localStorage.setItem("iterlay:language", "en-US");
    let setLanguage: ReturnType<typeof useI18n>["setLanguage"];
    function Harness() {
      setLanguage = useI18n().setLanguage;
      return createElement(GenerateActionButton, { buttonStyle: "send" }, "应用编辑");
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => { root.render(createElement(I18nProvider, null, createElement(Harness))); });
      await act(async () => { await loadUiTextCatalog(); });
      expect(container.querySelector("[data-send-default]")?.textContent).toBe("Apply edit");
      expect(container.querySelector("[data-send-sent]")?.textContent).toBe("Applied");
      await act(async () => setLanguage!("zh-CN"));
      expect(container.querySelector("[data-send-default]")?.textContent).toBe("应用编辑");
      expect(container.querySelector("[data-send-sent]")?.textContent).toBe("已应用");
      await act(async () => setLanguage!("en-US"));
      expect(container.querySelector("[data-send-default]")?.textContent).toBe("Apply edit");
    } finally { await act(async () => root.unmount()); }
  });

  it.each([["去配置", "Opened"], ["Configure", "Opened"], ["Apply edit", "Applied"], ["生成", "Submitted"]])("supports source and already translated labels: %s", async (label, acknowledgement) => {
    localStorage.setItem("iterlay:language", "en-US");
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(I18nProvider, null, createElement(GenerateActionButton, { buttonStyle: "send" }, label))));
      expect(container.querySelector("[data-send-sent]")?.textContent).toBe(acknowledgement);
    } finally { await act(async () => root.unmount()); }
  });

  it("keeps the legacy catalog out of the complete eager PromptDock module graph", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const visited = new Set<string>();
    function visit(file: string): void {
      if (visited.has(file)) return;
      visited.add(file);
      expect(file).not.toMatch(/legacy-messages\.[jt]sx?$/u);
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && node.isTypeOnly) continue;
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
          && !node.importClause.name && node.importClause.namedBindings.elements.every((element) => element.isTypeOnly)) continue;
        const name = node.moduleSpecifier.text;
        const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2))
          : name.startsWith("@shared/") ? path.join(root, "shared", name.slice(8))
          : name.startsWith(".") ? path.resolve(path.dirname(file), name) : undefined;
        if (!base) continue;
        const dependency = [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")].find(existsSync);
        if (dependency) visit(dependency);
      }
    }
    visit(path.join(root, "src/components/workbench/PromptDock.tsx"));
    expect(visited.size).toBeGreaterThan(30);
    expect([...visited].some((file) => file.endsWith("/ui-text.ts"))).toBe(true);
  });
});
