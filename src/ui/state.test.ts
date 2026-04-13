import { describe, expect, test } from "bun:test";
import { searchContent, getSearchableContent, initialAppState } from "./state.ts";
import type { AnyParsed } from "../core/models.ts";

describe("searchContent", () => {
  test("finds all occurrences with line info", () => {
    const results = searchContent("hello world\ngoodbye hello", "hello");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ lineNumber: 0, colStart: 0, matchLength: 5 });
    expect(results[1]).toMatchObject({ lineNumber: 1, colStart: 8, matchLength: 5 });
  });

  test("case-insensitive", () => {
    const results = searchContent("Hello\nHELLO\nhello", "hello");
    expect(results).toHaveLength(3);
  });

  test("returns empty for empty query", () => {
    expect(searchContent("content", "")).toEqual([]);
    expect(searchContent("content", "   ")).toEqual([]);
  });

  test("returns empty for no matches", () => {
    expect(searchContent("abc", "xyz")).toEqual([]);
  });

  test("finds multiple matches on same line", () => {
    const results = searchContent("aa aa aa", "aa");
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.lineNumber === 0)).toBe(true);
  });

  test("includes correct line text", () => {
    const results = searchContent("first line\nsecond line\nthird line", "second");
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe("second line");
    expect(results[0].lineNumber).toBe(1);
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

describe("initialAppState", () => {
  test("has correct defaults", () => {
    expect(initialAppState.searchOpen).toBe(false);
    expect(initialAppState.searchQuery).toBe("");
    expect(initialAppState.searchResults).toEqual([]);
    expect(initialAppState.searchSelectedIndex).toBe(0);
    expect(initialAppState.searchJumpMatch).toBeNull();
    expect(initialAppState.jsonViewMode).toBe("structured");
    expect(initialAppState.paletteOpen).toBe(false);
    expect(initialAppState.focusIndex).toBe(0);
  });
});
