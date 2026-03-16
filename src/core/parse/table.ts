import type { InputSource, ParsedTable } from "../models.ts";

export interface InferredTableStructure {
  format: ParsedTable["format"];
  columns: string[];
  rows: string[][];
}

export function parseTable(raw: string, source: InputSource): ParsedTable {
  const inferred = inferTableStructure(raw);
  if (inferred) {
    return {
      kind: "table",
      raw,
      source,
      format: inferred.format,
      columns: inferred.columns,
      rows: inferred.rows,
    };
  }

  const rows = normalizeLines(raw)
    .filter((line) => line.trim())
    .map((line) => [stripAnsi(line)]);

  return {
    kind: "table",
    raw,
    source,
    format: "fallback",
    columns: ["Value"],
    rows,
  };
}

export function inferTableStructure(raw: string): InferredTableStructure | null {
  const lines = normalizeLines(raw)
    .map((line) => stripAnsi(line))
    .filter((line) => line.trim() && !isSeparatorLine(line));

  if (lines.length < 2) return null;

  return inferDelimitedTable(lines, "\t", "tab")
    ?? inferDelimitedTable(lines, ",", "csv")
    ?? inferWhitespaceTable(lines)
    ?? inferAlignedTable(lines);
}

function inferDelimitedTable(
  lines: string[],
  delimiter: "\t" | ",",
  format: "tab" | "csv",
): InferredTableStructure | null {
  const header = splitDelimitedLine(lines[0] ?? "", delimiter).map((cell) => cell.trim());
  if (header.length < 2 || header.some((cell) => !cell)) return null;

  const rows = lines
    .slice(1)
    .map((line) => normalizeCellCount(splitDelimitedLine(line, delimiter), header.length));

  const sample = rows.slice(0, Math.min(rows.length, 8));
  const validRowCount = sample.filter((row) => row.filter(Boolean).length >= Math.max(2, header.length - 1)).length;

  if (validRowCount < Math.max(1, Math.min(2, sample.length))) return null;

  return {
    format,
    columns: header,
    rows,
  };
}

function inferAlignedTable(lines: string[]): InferredTableStructure | null {
  const headerLine = lines[0] ?? "";
  const starts = findColumnStarts(headerLine);
  if (starts.length < 2) return null;

  const columns = sliceAlignedLine(headerLine, starts).map((cell) => cell.replace(/:+$/, "").trim());
  if (columns.length < 2 || columns.some((cell) => !cell)) return null;

  const rows = lines.slice(1).map((line) => sliceAlignedLine(line, starts));
  const sample = rows.slice(0, Math.min(rows.length, 8));
  const validRowCount = sample.filter((row) => row.filter(Boolean).length >= Math.max(2, Math.ceil(columns.length * 0.6))).length;

  if (validRowCount < Math.max(1, Math.min(2, sample.length))) return null;

  return {
    format: "aligned",
    columns,
    rows,
  };
}

function inferWhitespaceTable(lines: string[]): InferredTableStructure | null {
  const columns = splitWhitespaceLine(lines[0] ?? "");
  if (columns.length < 2) return null;

  const rows = lines.slice(1).map((line) => normalizeCellCount(splitWhitespaceLine(line), columns.length));
  const sample = rows.slice(0, Math.min(rows.length, 8));
  const validRowCount = sample.filter((row) => row.filter(Boolean).length >= Math.max(2, columns.length - 1)).length;

  if (validRowCount < Math.max(1, Math.min(2, sample.length))) return null;

  return {
    format: "aligned",
    columns,
    rows,
  };
}

function splitDelimitedLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") {
    return line.split("\t");
  }

  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

function normalizeCellCount(cells: string[], expected: number): string[] {
  const trimmed = cells.map((cell) => cell.trim());
  if (trimmed.length === expected) return trimmed;
  if (trimmed.length < expected) {
    return [...trimmed, ...Array.from({ length: expected - trimmed.length }, () => "")];
  }
  return [
    ...trimmed.slice(0, expected - 1),
    trimmed.slice(expected - 1).join(" ").trim(),
  ];
}

function splitWhitespaceLine(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function findColumnStarts(line: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const current = line[i] ?? "";
    const previous = i === 0 ? " " : line[i - 1] ?? " ";
    if (current !== " " && previous === " ") {
      starts.push(i);
    }
  }
  return starts;
}

function sliceAlignedLine(line: string, starts: number[]): string[] {
  const cells: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i] ?? 0;
    const end = starts[i + 1] ?? line.length;
    cells.push(line.slice(start, end).trim());
  }
  return cells;
}

function normalizeLines(raw: string): string[] {
  return raw.replace(/\r\n?/g, "\n").split("\n");
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[-=|:]{3,}$/.test(trimmed);
}
