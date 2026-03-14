/**
 * Shared utilities for rendering styled content lines in TUI screens.
 * Handles inline markdown formatting (bold, italic, code, links) and
 * simple keyword-based syntax coloring for code blocks.
 */

import { theme } from "../theme.ts";

export type Segment = { text: string; fg: string };
export type StyledLine = Segment[];

const KEYWORDS = new Set([
  "function", "const", "let", "var", "if", "else", "return", "import", "export",
  "from", "class", "new", "this", "async", "await", "for", "while", "do",
  "switch", "case", "break", "continue", "default", "try", "catch", "finally",
  "throw", "typeof", "instanceof", "in", "of", "true", "false", "null",
  "undefined", "void", "yield", "static", "extends", "implements", "interface",
  "type", "enum", "namespace", "public", "private", "protected", "readonly",
  "abstract", "declare", "module", "require", "def", "self", "None", "True",
  "False", "lambda", "pass", "raise", "with", "as", "elif", "except", "print",
  "fn", "pub", "mut", "impl", "struct", "trait", "use", "mod", "crate", "match",
  "func", "package", "defer", "go", "chan", "select", "range", "map",
]);

export function highlightCode(code: string): StyledLine[] {
  return code.split("\n").slice(0, 60).map((line) => {
    const segments: Segment[] = [];
    let i = 0;
    let buf = "";

    const flush = () => {
      if (buf) { segments.push({ text: buf, fg: theme.text }); buf = ""; }
    };

    while (i < line.length) {
      if (line[i] === "/" && line[i + 1] === "/") {
        flush();
        segments.push({ text: line.slice(i), fg: theme.textMuted });
        i = line.length;
        continue;
      }
      if (line[i] === "#" && (i === 0 || line[i - 1] === " ") && !/^#(include|define|if|endif|pragma)/.test(line.slice(i))) {
        flush();
        segments.push({ text: line.slice(i), fg: theme.textMuted });
        i = line.length;
        continue;
      }
      if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
        flush();
        const q = line[i];
        let j = i + 1;
        while (j < line.length && line[j] !== q) { if (line[j] === "\\") j++; j++; }
        j = Math.min(j + 1, line.length);
        segments.push({ text: line.slice(i, j), fg: theme.success });
        i = j;
        continue;
      }
      if (/\d/.test(line[i]) && (i === 0 || /[\s,=([\]{};:+\-*/<>!]/.test(line[i - 1]))) {
        flush();
        let j = i;
        while (j < line.length && /[\d.xXa-fA-F_]/.test(line[j])) j++;
        segments.push({ text: line.slice(i, j), fg: theme.warning });
        i = j;
        continue;
      }
      if (/[a-zA-Z_]/.test(line[i])) {
        flush();
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
        const word = line.slice(i, j);
        segments.push({ text: word, fg: KEYWORDS.has(word) ? theme.primary : theme.text });
        i = j;
        continue;
      }
      buf += line[i];
      i++;
    }
    flush();
    return segments.length ? segments : [{ text: " ", fg: theme.text }];
  });
}

export function parseInlineMarkdown(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /(\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index), fg: theme.text });
    }
    if (m[2] || m[3]) {
      segments.push({ text: m[2] || m[3], fg: theme.text });
    } else if (m[4] || m[5]) {
      segments.push({ text: m[4] || m[5], fg: theme.textMuted });
    } else if (m[6]) {
      segments.push({ text: m[6], fg: theme.warning });
    } else if (m[7] && m[8]) {
      segments.push({ text: m[7], fg: theme.primary });
      segments.push({ text: ` (${m[8]})`, fg: theme.textMuted });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), fg: theme.text });
  }
  return segments.length ? segments : [{ text: text || " ", fg: theme.text }];
}

export function wrapText(s: string, width: number): string[] {
  if (width <= 0) return [s];
  if (s.length <= width) return [s];
  const out: string[] = [];
  const words = s.split(/\s+/);
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 <= width) {
      line += (line ? " " : "") + w;
    } else {
      if (line) {
        out.push(line);
        line = "";
      }

      if (w.length <= width) {
        line = w;
        continue;
      }

      let remaining = w;
      while (remaining.length > width) {
        out.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      line = remaining;
    }
  }
  if (line) out.push(line);
  return out;
}
