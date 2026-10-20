import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(".");
const configFile = ts.readConfigFile(path.join(projectRoot, "tsconfig.json"), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);

/** Follow local runtime imports, including literal dynamic imports, but erase type-only edges. */
function runtimeModules(entry: string): Set<string> {
  const modules = new Set<string>();
  function visitFile(file: string): void {
    if (modules.has(file)) return;
    modules.add(file);
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function follow(specifier: string): void {
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      if (resolved && !resolved.isExternalLibraryImport && /\.[cm]?tsx?$/.test(resolved.resolvedFileName)) {
        visitFile(resolved.resolvedFileName);
      }
    }
    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const allNamedTypes = !clause?.name && named && ts.isNamedImports(named)
          && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly);
        if (!clause?.isTypeOnly && !allNamedTypes) follow(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const allNamedTypes = node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.length > 0 && node.exportClause.elements.every((element) => element.isTypeOnly);
        if (!node.isTypeOnly && !allNamedTypes) follow(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        follow(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  visitFile(path.resolve(entry));
  return modules;
}

describe("production runtime module boundaries", () => {
  it("keeps installed plugin business code outside the host App dependency graph", () => {
    const modules = runtimeModules("src/App.tsx");
    expect(modules.size).toBeGreaterThan(50);
    const pluginRoot = `${path.join(projectRoot, "plugins")}${path.sep}`;
    expect([...modules].filter((file) => file.startsWith(pluginRoot))).toEqual([]);
  });

  it("uses agent protocol helpers without loading the MasterGo integration for text assistance", () => {
    const modules = runtimeModules("electron/providers/text-assistant.ts");
    expect(modules.has(path.resolve("electron/agents/completion-protocol.ts"))).toBe(true);
    expect(modules.has(path.resolve("electron/mastergo-bridge.ts"))).toBe(false);
  });
});
