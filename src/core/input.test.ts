import { describe, expect, test } from "bun:test";
import { resolveInput } from "./input.ts";
import { detectContentType } from "./detect.ts";
import { parse } from "./parse/index.ts";

describe("resolveInput", () => {
  const noStdin = { stdin: false };
  test("returns null for no args when no stdin", () => {
    expect(resolveInput([], noStdin)).toBeNull();
  });
  test("prefers an explicit arg over stdin", () => {
    const r = resolveInput(["README.md"], { stdin: true });
    expect(r).not.toBeNull();
    expect(r!.type).toBe("file");
    expect(r!.value).toBe("README.md");
  });
  test("returns url for https", () => {
    const r = resolveInput(["https://example.com"], noStdin);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("url");
    expect(r!.value).toBe("https://example.com");
    expect(r!.label).toBe("https://example.com");
  });
  test("returns file for path", () => {
    const r = resolveInput(["README.md"], noStdin);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("file");
    expect(r!.value).toBe("README.md");
  });
  test("treats a leading dash positional as a file path", () => {
    const r = resolveInput(["--literal-file.md"], noStdin);
    expect(r).not.toBeNull();
    expect(r!.type).toBe("file");
    expect(r!.value).toBe("--literal-file.md");
  });
});

describe("detectContentType", () => {
  test("detects json", () => {
    const d = detectContentType('{"a":1}', { type: "stdin", value: "stdin" });
    expect(d.type).toBe("json");
  });
  test("detects markdown", () => {
    const d = detectContentType("# Hello\n\nWorld", { type: "stdin", value: "stdin" });
    expect(d.type).toBe("markdown");
  });
  test("detects text fallback", () => {
    const d = detectContentType("plain text", { type: "stdin", value: "stdin" });
    expect(d.type).toBe("text");
  });
});

describe("parse", () => {
  test("parses json", async () => {
    const doc = await parse({
      type: "json",
      raw: '{"x":1}',
      source: { type: "stdin", value: "stdin" },
    });
    expect(doc.kind).toBe("json");
    if (doc.kind === "json") {
      expect(doc.schemaSummary).toContain("object");
      expect(doc.root).toEqual({ x: 1 });
    }
  });
  test("parses markdown", async () => {
    const doc = await parse({
      type: "markdown",
      raw: "# Hi\n\nPara",
      source: { type: "stdin", value: "stdin" },
    });
    expect(doc.kind).toBe("markdown");
    if (doc.kind === "markdown") {
      expect(doc.headings.length).toBe(1);
      expect(doc.headings[0].text).toBe("Hi");
    }
  });
});
