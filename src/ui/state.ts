/**
 * App-level UI state: search, palette, json view mode, focus.
 */

export interface AppState {
  searchOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  searchSelectedIndex: number;
  /** When set, the content view should scroll to highlight this match. */
  searchJumpMatch: SearchResult | null;
  jsonViewMode: "structured" | "raw";
  paletteOpen: boolean;
  focusIndex: number;
}

export const initialAppState: AppState = {
  searchOpen: false,
  searchQuery: "",
  searchResults: [],
  searchSelectedIndex: 0,
  searchJumpMatch: null,
  jsonViewMode: "structured",
  paletteOpen: false,
  focusIndex: 0,
};

import type { AnyParsed } from "../core/models.ts";

export interface SearchResult {
  /** The line containing the match */
  line: string;
  /** 0-based line number in the searchable content */
  lineNumber: number;
  /** Character offset of the match start within `line` */
  colStart: number;
  /** Length of the matched text */
  matchLength: number;
}

export function getSearchableContent(doc: AnyParsed): string {
  switch (doc.kind) {
    case "docs":
      return doc.mainContent + "\n" + doc.sections.map((s) => {
        const sectionText = s.content.replace(/\[\[CODEBLOCK_\d+\]\]/g, " ");
        const code = s.codeBlocks?.map((block) => block.code).join("\n") ?? "";
        return `${s.title}\n${sectionText}\n${code}`;
      }).join("\n");
    case "json":
      return JSON.stringify(doc.root, null, 2);
    case "diff":
      return [
        doc.title,
        doc.summary,
        doc.leftLabel,
        doc.rightLabel,
        ...doc.entries.flatMap((entry) => [entry.title, entry.detail ?? "", entry.before ?? "", entry.after ?? ""]),
      ].join("\n");
    case "markdown":
      return doc.raw;
    case "github-pr":
      return doc.body + "\n" + doc.title + "\n" + doc.files.map((f) => f.path).join("\n");
    case "dashboard":
      return doc.panels.flatMap((p) => [p.title ?? "", ...p.values].filter(Boolean)).join("\n");
    case "table":
      return [doc.columns.join("\t"), ...doc.rows.map((row) => row.join("\t"))].join("\n");
    case "log":
      return doc.raw;
    default:
      return doc.content;
  }
}

/**
 * Search content line-by-line and return structured results with context.
 * Each result knows its line number, the full line text, and where the match
 * sits within that line, so the search screen can render context + highlights.
 */
export function searchContent(content: string, query: string): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  const lines = content.split("\n");
  const results: SearchResult[] = [];
  const MAX_RESULTS = 500;

  for (let lineNumber = 0; lineNumber < lines.length && results.length < MAX_RESULTS; lineNumber++) {
    const line = lines[lineNumber];
    const lower = line.toLowerCase();
    let col = 0;
    while (col < lower.length) {
      const idx = lower.indexOf(q, col);
      if (idx === -1) break;
      results.push({ line, lineNumber, colStart: idx, matchLength: q.length });
      col = idx + 1;
    }
  }

  return results;
}

/** Deduplicate results to unique lines, keeping the first match per line. */
export function uniqueLineResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<number>();
  const out: SearchResult[] = [];
  for (const r of results) {
    if (!seen.has(r.lineNumber)) {
      seen.add(r.lineNumber);
      out.push(r);
    }
  }
  return out;
}
