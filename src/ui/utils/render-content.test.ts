import { describe, expect, test } from "bun:test";
import { highlightCode, parseInlineMarkdown, wrapText } from "./render-content.ts";

describe("wrapText", () => {
  test("returns single line when within width", () => {
    expect(wrapText("hello", 10)).toEqual(["hello"]);
  });

  test("wraps at word boundaries", () => {
    const result = wrapText("hello world foo bar", 11);
    expect(result).toEqual(["hello world", "foo bar"]);
  });

  test("wraps words longer than width without dropping content", () => {
    const result = wrapText("superlongword", 5);
    expect(result).toEqual(["super", "longw", "ord"]);
  });

  test("handles empty string", () => {
    expect(wrapText("", 80)).toEqual([""]);
  });
});

describe("parseInlineMarkdown", () => {
  test("returns plain text as single segment", () => {
    const result = parseInlineMarkdown("hello world");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("hello world");
  });

  test("detects bold with **", () => {
    const result = parseInlineMarkdown("some **bold** text");
    expect(result.length).toBeGreaterThanOrEqual(3);
    const boldSeg = result.find((s) => s.text === "bold");
    expect(boldSeg).toBeDefined();
  });

  test("detects inline code with backticks", () => {
    const result = parseInlineMarkdown("use `const x` here");
    const codeSeg = result.find((s) => s.text === "const x");
    expect(codeSeg).toBeDefined();
  });

  test("detects links", () => {
    const result = parseInlineMarkdown("see [docs](https://example.com)");
    const linkText = result.find((s) => s.text === "docs");
    const linkUrl = result.find((s) => s.text.includes("https://example.com"));
    expect(linkText).toBeDefined();
    expect(linkUrl).toBeDefined();
  });

  test("handles empty string", () => {
    const result = parseInlineMarkdown("");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(" ");
  });
});

describe("highlightCode", () => {
  test("highlights keywords", () => {
    const lines = highlightCode("const x = 1;");
    expect(lines).toHaveLength(1);
    const constSeg = lines[0].find((s) => s.text === "const");
    expect(constSeg).toBeDefined();
  });

  test("highlights strings", () => {
    const lines = highlightCode('const s = "hello";');
    const strSeg = lines[0].find((s) => s.text === '"hello"');
    expect(strSeg).toBeDefined();
  });

  test("highlights numbers", () => {
    const lines = highlightCode("let x = 42;");
    const numSeg = lines[0].find((s) => s.text === "42");
    expect(numSeg).toBeDefined();
  });

  test("highlights comments", () => {
    const lines = highlightCode("x = 1; // comment");
    const commentSeg = lines[0].find((s) => s.text.includes("// comment"));
    expect(commentSeg).toBeDefined();
  });

  test("handles multi-line code", () => {
    const lines = highlightCode("line1\nline2\nline3");
    expect(lines).toHaveLength(3);
  });

  test("handles empty string", () => {
    const lines = highlightCode("");
    expect(lines).toHaveLength(1);
  });

  test("truncates beyond 60 lines", () => {
    const bigCode = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n");
    const lines = highlightCode(bigCode);
    expect(lines.length).toBeLessThanOrEqual(60);
  });
});
