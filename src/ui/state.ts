/**
 * App-level UI state: search, palette, json view mode, focus.
 */

export interface AppState {
  searchOpen: boolean;
  searchQuery: string;
  searchMatches: number[];
  searchIndex: number;
  jsonViewMode: "structured" | "raw";
  paletteOpen: boolean;
  focusIndex: number;
}

export const initialAppState: AppState = {
  searchOpen: false,
  searchQuery: "",
  searchMatches: [],
  searchIndex: 0,
  jsonViewMode: "structured",
  paletteOpen: false,
  focusIndex: 0,
};

import type { AnyParsed } from "../core/models.ts";

export function getSearchableContent(doc: AnyParsed): string {
  switch (doc.kind) {
    case "docs":
      return doc.mainContent + " " + doc.sections.map((s) => {
        const sectionText = s.content.replace(/\[\[CODEBLOCK_\d+\]\]/g, " ");
        const code = s.codeBlocks?.map((block) => block.code).join(" ") ?? "";
        return `${s.title} ${sectionText} ${code}`;
      }).join(" ");
    case "json":
      return JSON.stringify(doc.root);
    case "markdown":
      return doc.raw;
    case "github-pr":
      return doc.body + " " + doc.title + " " + doc.files.map((f) => f.path).join(" ");
    case "dashboard":
      return doc.panels.flatMap((p) => [p.title ?? "", ...p.values].filter(Boolean)).join(" ");
    default:
      return doc.content;
  }
}

export function runSearch(content: string, query: string): number[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  const lower = content.toLowerCase();
  const matches: number[] = [];
  let i = 0;
  while (true) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) break;
    matches.push(idx);
    i = idx + 1;
  }
  return matches;
}

export function searchMatchToLine(content: string, charOffset: number): number {
  let line = 0;
  const end = Math.min(charOffset, content.length);
  for (let i = 0; i < end; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}
