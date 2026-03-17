import { describe, expect, test } from "bun:test";
import { runSearch, getSearchableContent, searchMatchToLine, initialAppState } from "./state.ts";
import type { AnyParsed } from "../core/models.ts";

describe("runSearch", () => {
  test("finds all occurrences", () => {
    const matches = runSearch("hello world hello", "hello");
    expect(matches).toEqual([0, 12]);
  });

  test("case-insensitive", () => {
    const matches = runSearch("Hello HELLO hello", "hello");
    expect(matches).toHaveLength(3);
  });

  test("returns empty for empty query", () => {
    expect(runSearch("content", "")).toEqual([]);
    expect(runSearch("content", "   ")).toEqual([]);
  });

  test("returns empty for no matches", () => {
    expect(runSearch("abc", "xyz")).toEqual([]);
  });

  test("handles overlapping patterns", () => {
    const matches = runSearch("aaa", "aa");
    expect(matches).toEqual([0, 1]);
  });
});

describe("getSearchableContent", () => {
  test("returns raw for markdown", () => {
    const doc: AnyParsed = {
      kind: "markdown",
      title: "Test",
      headings: [],
      codeBlocks: [],
      content: "<p>html</p>",
      raw: "# Test\nContent here",
    };
    const content = getSearchableContent(doc);
    expect(content).toBe("# Test\nContent here");
  });

  test("returns stringified JSON for json", () => {
    const doc: AnyParsed = {
      kind: "json",
      root: { a: 1 },
      schemaSummary: "object: a",
      isArrayOfObjects: false,
      node: { type: "object", keys: ["a"], value: { a: 1 } },
      classification: "object",
      entries: [],
      anomalies: [],
    };
    expect(getSearchableContent(doc)).toContain('"a"');
  });

  test("returns content for text", () => {
    const doc: AnyParsed = {
      kind: "text",
      content: "plain text here",
      source: { type: "stdin", value: "stdin" },
    };
    expect(getSearchableContent(doc)).toBe("plain text here");
  });
});

describe("searchMatchToLine", () => {
  test("returns 0 for offset on first line", () => {
    expect(searchMatchToLine("hello world", 5)).toBe(0);
  });

  test("counts newlines before offset", () => {
    expect(searchMatchToLine("line1\nline2\nline3", 6)).toBe(1);
    expect(searchMatchToLine("line1\nline2\nline3", 12)).toBe(2);
  });

  test("returns 0 for offset 0", () => {
    expect(searchMatchToLine("any content", 0)).toBe(0);
  });

  test("handles offset beyond content length", () => {
    expect(searchMatchToLine("a\nb", 100)).toBe(1);
  });

  test("handles empty content", () => {
    expect(searchMatchToLine("", 0)).toBe(0);
  });
});

describe("initialAppState", () => {
  test("has correct defaults", () => {
    expect(initialAppState.searchOpen).toBe(false);
    expect(initialAppState.searchQuery).toBe("");
    expect(initialAppState.searchMatches).toEqual([]);
    expect(initialAppState.jsonViewMode).toBe("structured");
    expect(initialAppState.paletteOpen).toBe(false);
    expect(initialAppState.focusIndex).toBe(0);
  });
});
