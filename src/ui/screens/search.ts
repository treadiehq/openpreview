import {
  Box,
  BoxRenderable,
  ScrollBoxRenderable,
  Text,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { SearchResult } from "../state.ts";
import { wrapText } from "../utils/render-content.ts";

const CONTEXT_LINES = 1;
const MAX_VISIBLE_RESULTS = 200;
const LINE_NUM_WIDTH = 6;

export interface SearchScreenOptions {
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  contentLines: string[];
}

export function SearchScreen(renderer: RenderContext, options: SearchScreenOptions) {
  const { query, results, selectedIndex, contentLines } = options;
  const uniqueResults = deduplicateByLine(results);
  const visibleResults = uniqueResults.slice(0, MAX_VISIBLE_RESULTS);
  const contentWidth = Math.max(24, renderer.width - 8);

  const inputBar = buildInputBar(query, results.length, contentWidth);

  const resultsBox = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    padding: 1,
    paddingLeft: 2,
    contentOptions: { flexDirection: "column", gap: 0 },
  });

  if (query.trim() && visibleResults.length === 0) {
    resultsBox.add(new TextRenderable(renderer, {
      content: "No matches found",
      fg: theme.textMuted,
    }));
  } else if (!query.trim()) {
    resultsBox.add(new TextRenderable(renderer, {
      content: "Type to search…",
      fg: theme.textMuted,
    }));
  } else {
    let lastRenderedLine = -1;

    for (let i = 0; i < visibleResults.length; i++) {
      const result = visibleResults[i];
      const isSelected = i === selectedIndex;

      const contextStart = Math.max(0, result.lineNumber - CONTEXT_LINES);
      const contextEnd = Math.min(contentLines.length - 1, result.lineNumber + CONTEXT_LINES);

      if (lastRenderedLine >= 0 && contextStart > lastRenderedLine + 1) {
        resultsBox.add(new TextRenderable(renderer, {
          content: " ".repeat(LINE_NUM_WIDTH) + " ···",
          fg: theme.textMuted,
        }));
      }

      const renderStart = Math.max(contextStart, lastRenderedLine + 1);

      for (let ln = renderStart; ln <= contextEnd; ln++) {
        const lineText = contentLines[ln] ?? "";
        const isMatchLine = ln === result.lineNumber;

        if (isMatchLine) {
          const row = buildHighlightedLine(
            renderer,
            ln + 1,
            lineText,
            query,
            isSelected,
            contentWidth - LINE_NUM_WIDTH - 2,
          );
          resultsBox.add(row);
        } else {
          const truncated = truncateLine(lineText, contentWidth - LINE_NUM_WIDTH - 2);
          const row = new BoxRenderable(renderer, { flexDirection: "row" });
          row.add(new TextRenderable(renderer, {
            content: padLineNum(ln + 1),
            fg: theme.textMuted,
          }));
          row.add(new TextRenderable(renderer, {
            content: " " + truncated,
            fg: theme.textMuted,
          }));
          resultsBox.add(row);
        }
      }

      lastRenderedLine = contextEnd;
    }

    if (results.length > MAX_VISIBLE_RESULTS) {
      resultsBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));
      resultsBox.add(new TextRenderable(renderer, {
        content: `  … and ${results.length - MAX_VISIBLE_RESULTS} more matches`,
        fg: theme.textMuted,
      }));
    }
  }

  if (query.trim() && visibleResults.length > 0) {
    scrollToSelected(resultsBox, visibleResults, selectedIndex);
  }

  const body = Box(
    { flexDirection: "column", flexGrow: 1, width: "100%", height: "100%" },
    inputBar,
    Box(
      { width: "100%", height: 1 },
      Text({ content: "─".repeat(200), fg: theme.borderSubtle }),
    ),
    resultsBox,
  );

  return { body, resultsBox };
}

function buildInputBar(
  query: string,
  totalMatches: number,
  _contentWidth: number,
) {
  const display = query || "Search…";
  const displayColor = query ? theme.text : theme.textMuted;
  const matchLabel = !query.trim()
    ? ""
    : totalMatches === 0
      ? "No matches"
      : `${totalMatches} match${totalMatches === 1 ? "" : "es"}`;

  return Box(
    {
      flexDirection: "row",
      alignItems: "center",
      paddingX: 2,
      paddingY: 1,
      gap: 1,
      backgroundColor: theme.bgElevated,
    },
    Text({ content: "/", fg: theme.primary }),
    Text({ content: display, fg: displayColor }),
    Text({ content: "█", fg: theme.primary }),
    Box({ flexGrow: 1 }),
    ...(matchLabel
      ? [Text({ content: matchLabel, fg: theme.textMuted })]
      : []),
    Text({ content: "Esc close · Enter jump", fg: theme.textMuted }),
  );
}

function buildHighlightedLine(
  renderer: RenderContext,
  lineNum: number,
  lineText: string,
  query: string,
  isSelected: boolean,
  maxWidth: number,
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    flexDirection: "row",
    backgroundColor: isSelected ? theme.bgMuted : undefined,
  });

  row.add(new TextRenderable(renderer, {
    content: padLineNum(lineNum),
    fg: isSelected ? theme.accent : theme.primary,
  }));

  const q = query.trim().toLowerCase();
  const lower = lineText.toLowerCase();
  const segments: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;

  while (cursor < lineText.length) {
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) {
      segments.push({ text: lineText.slice(cursor), highlight: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: lineText.slice(cursor, idx), highlight: false });
    }
    segments.push({ text: lineText.slice(idx, idx + q.length), highlight: true });
    cursor = idx + q.length;
  }

  let charBudget = maxWidth;
  row.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));

  for (const seg of segments) {
    if (charBudget <= 0) break;
    const text = seg.text.slice(0, charBudget);
    charBudget -= text.length;

    if (seg.highlight) {
      row.add(new TextRenderable(renderer, {
        content: text,
        fg: theme.bg,
        backgroundColor: theme.warning,
      }));
    } else {
      row.add(new TextRenderable(renderer, {
        content: text,
        fg: isSelected ? theme.text : theme.text,
      }));
    }
  }

  return row;
}

function scrollToSelected(
  resultsBox: ScrollBoxRenderable,
  results: SearchResult[],
  selectedIndex: number,
): void {
  let scrollLine = 0;
  for (let i = 0; i < Math.min(selectedIndex, results.length); i++) {
    const gap = i === 0
      ? results[i].lineNumber + CONTEXT_LINES + 1
      : results[i].lineNumber - results[i - 1].lineNumber + CONTEXT_LINES;
    scrollLine += Math.max(gap, 1 + 2 * CONTEXT_LINES);
  }
  resultsBox.scrollTo(Math.max(0, scrollLine - 2));
}

function deduplicateByLine(results: SearchResult[]): SearchResult[] {
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

function padLineNum(n: number): string {
  const s = String(n);
  return " ".repeat(Math.max(0, LINE_NUM_WIDTH - s.length)) + s;
}

function truncateLine(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text || " ";
  return text.slice(0, maxWidth - 1) + "…";
}
