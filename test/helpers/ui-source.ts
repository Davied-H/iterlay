import { readFileSync, type PathLike } from "node:fs";
import ts from "typescript";

/** Inspect UI structure without coupling static guards to localization syntax. */
export function readUiSource(file: PathLike, encoding: "utf8" = "utf8"): string {
  const text = readFileSync(file, encoding);
  const source = ts.createSourceFile(String(file), text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Array<[number, number, string]> = [];
  function literal(node: ts.Node): { text: string; template: boolean } | null {
    if (!ts.isCallExpression(node) || !["uiText", "translateSourceText"].includes(node.expression.getText(source))) return null;
    const first = node.arguments[0];
    if (!first || !ts.isStringLiteral(first)) return null;
    const values = node.arguments[1];
    if (!values || !ts.isArrayLiteralExpression(values)) return { text: first.text, template: false };
    const value = first.text.replace(/\{\{ui:(\d+)\}\}/gu, (_token, index: string) => "$" + "{" + values.elements[Number(index)].getText(source) + "}");
    return { text: value, template: true };
  }
  function expression(value: { text: string; template: boolean }): string {
    return value.template ? String.fromCharCode(96) + value.text + String.fromCharCode(96) : JSON.stringify(value.text);
  }
  function visit(node: ts.Node): void {
    if (ts.isJsxExpression(node) && node.expression) {
      const value = literal(node.expression);
      if (value) {
        const attribute = ts.isJsxAttribute(node.parent);
        edits.push([node.getStart(source), node.end, attribute
          ? value.template ? "{" + expression(value) + "}" : expression(value)
          : value.template ? "{" + expression(value) + "}" : value.text]);
        return;
      }
    }
    const value = literal(node);
    if (value) { edits.push([node.getStart(source), node.end, expression(value)]); return; }
    ts.forEachChild(node, visit);
  }
  visit(source);
  let result = text;
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) result = result.slice(0, start) + replacement + result.slice(end);
  return result;
}
