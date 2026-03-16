import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { InputSource, ParsedDocs, ParsedJson, ParsedText, PreviewInspectInfo } from "./models.ts";
import { exportSkillBundle, renderDocumentForAgent, supportsSkillExport } from "./export.ts";

const urlSource: InputSource = {
  type: "url",
  value: "https://texturehq.com",
  label: "texturehq.com",
};

const inspectInfo: PreviewInspectInfo = {
  sourceType: "url",
  forcedMode: "auto",
  detectedType: "html",
  contentType: "text/html",
  totalBytes: 2048,
  displayedBytes: 2048,
  truncated: false,
  detectionSummary: "Detected docs.",
  signals: [],
  jsHeavy: false,
};

describe("renderDocumentForAgent", () => {
  test("renders docs content with code blocks and links", () => {
    const doc: ParsedDocs = {
      kind: "docs",
      title: "Texture",
      description: "AI-native platform for energy operations.",
      url: "https://texturehq.com",
      mainContent: "",
      codeBlocks: [],
      links: [{ text: "Docs", href: "https://texturehq.com/docs" }],
      sections: [
        {
          id: "intro",
          level: 1,
          title: "How it works",
          content: "First paragraph.\n[[CODEBLOCK_0]]\nSecond paragraph.",
          codeBlocks: [{ language: "bash", code: "preview https://texturehq.com" }],
        },
      ],
    };

    const result = renderDocumentForAgent(doc, urlSource, inspectInfo);

    expect(result).toContain("# Texture");
    expect(result).toContain("## Description");
    expect(result).toContain("### How it works");
    expect(result).toContain("```bash");
    expect(result).toContain("preview https://texturehq.com");
    expect(result).toContain("[Docs](https://texturehq.com/docs)");
  });

  test("renders json content as pretty json", () => {
    const doc: ParsedJson = {
      kind: "json",
      root: { ok: true, items: [1, 2] },
      schemaSummary: "Object with 2 keys",
      isArrayOfObjects: false,
      node: null,
    };

    const result = renderDocumentForAgent(doc, {
      type: "file",
      value: "fixtures/sample.json",
      label: "sample.json",
    });

    expect(result).toContain("## JSON");
    expect(result).toContain('"ok": true');
    expect(result).toContain('"items": [');
  });
});

describe("supportsSkillExport", () => {
  test("allows docs and text but not json", () => {
    const docs: ParsedDocs = {
      kind: "docs",
      title: "Texture",
      description: "",
      url: "",
      mainContent: "",
      codeBlocks: [],
      links: [],
      sections: [],
    };
    const text: ParsedText = {
      kind: "text",
      content: "hello",
      source: { type: "stdin", value: "stdin", label: "stdin" },
    };
    const json: ParsedJson = {
      kind: "json",
      root: {},
      schemaSummary: "Object",
      isArrayOfObjects: false,
      node: null,
    };

    expect(supportsSkillExport(docs)).toBe(true);
    expect(supportsSkillExport(text)).toBe(true);
    expect(supportsSkillExport(json)).toBe(false);
  });
});

describe("exportSkillBundle", () => {
  test("writes a skill bundle with references", async () => {
    const doc: ParsedDocs = {
      kind: "docs",
      title: "Texture",
      description: "AI-native platform for energy operations.",
      url: "https://texturehq.com",
      mainContent: "",
      codeBlocks: [],
      links: [],
      sections: [
        {
          id: "intro",
          level: 1,
          title: "Overview",
          content: "Operations content.",
          codeBlocks: [],
        },
      ],
    };

    const baseDir = await mkdtemp(join(tmpdir(), "openpreview-export-"));
    const result = await exportSkillBundle(doc, urlSource, inspectInfo, {
      baseDir,
      now: new Date("2026-03-16T12:34:56Z"),
    });

    const skillText = await readFile(join(result.directoryPath, "SKILL.md"), "utf8");
    const sourceText = await readFile(join(result.directoryPath, "references", "source.md"), "utf8");

    expect(result.skillName).toBe("texturehq-docs");
    expect(result.directoryPath).toContain("texturehq-docs-skill-20260316-123456");
    expect(skillText).toContain("name: texturehq-docs");
    expect(skillText).toContain("Read `references/source.md`");
    expect(sourceText).toContain("# Texture");
    expect(sourceText).toContain("### Overview");

    if (result.archivePath) {
      expect(result.archivePath).toContain(".tar.gz");
      expect(result.savedPath).toBe(result.archivePath);
    } else {
      expect(result.savedPath).toBe(result.directoryPath);
    }
  });
});
