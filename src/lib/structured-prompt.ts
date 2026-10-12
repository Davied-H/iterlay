export interface StructuredPromptLine {
  label: string;
  content: string;
  separator: "" | ":" | "：";
  spacing: string;
}

const STRUCTURED_FIELD_PATTERN = /^([^：:\n]+?)([：:])([ \t]*)(.*)$/;

export function parseStructuredPromptLines(source: string): StructuredPromptLine[] {
  return source.split(/\r?\n/).map((line) => {
    const match = STRUCTURED_FIELD_PATTERN.exec(line);
    if (!match) return { label: "", content: line, separator: "", spacing: "" };
    return {
      label: match[1],
      separator: match[2] as ":" | "：",
      spacing: match[3],
      content: match[4]
    };
  });
}

export function composeStructuredPromptLines(lines: StructuredPromptLine[]): string {
  return lines
    .map((line) =>
      line.separator ? `${line.label}${line.separator}${line.spacing}${line.content}` : line.content
    )
    .join("\n");
}

export function hasStructuredPromptFields(source: string): boolean {
  const nonEmptyLines = parseStructuredPromptLines(source).filter(
    (line) => line.label.trim() || line.content.trim()
  );
  const labeledLineCount = nonEmptyLines.filter((line) => line.separator).length;
  return (
    nonEmptyLines.length >= 2 &&
    labeledLineCount >= 2 &&
    labeledLineCount >= Math.ceil(nonEmptyLines.length * 0.6)
  );
}
