import { describe, expect, test } from "bun:test";
import { buildExplainReport } from "./explain.ts";
import type { LoadedPreview } from "./preview-session.ts";

describe("buildExplainReport", () => {
  test("prints detection, truncation, signals, and document stats", () => {
    const loaded: LoadedPreview = {
      source: { type: "url", value: "https://example.com/docs" },
      detected: {
        type: "html",
        raw: "<html></html>",
        source: { type: "url", value: "https://example.com/docs" },
      },
      doc: {
        kind: "docs",
        title: "Example Docs",
        description: "Docs page",
        url: "https://example.com/docs",
        sections: [{ id: "intro", level: 1, title: "Intro", content: "Hello world" }],
        links: [{ text: "Install", href: "https://example.com/install" }],
        codeBlocks: [],
        mainContent: "Hello world",
      },
      inspectInfo: {
        sourceType: "url",
        forcedMode: "auto",
        detectedType: "html",
        contentType: "text/html; charset=utf-8",
        totalBytes: 2048,
        displayedBytes: 1024,
        truncated: true,
        truncationReason: "Fetched content exceeded 10 MB.",
        detectionSummary: "Detected Docs mode from HTML content.",
        nextAction: "Try `preview --mode docs <url>` if this looks wrong.",
        signals: [
          { name: "panel/card classes", matched: true },
          { name: "js-heavy shell", matched: false },
        ],
        jsHeavy: false,
      },
    };

    const report = buildExplainReport(loaded);

    expect(report).toContain("preview explain");
    expect(report).toContain("Detected mode: Docs");
    expect(report).toContain("Truncated: yes");
    expect(report).toContain("Truncation: Fetched content exceeded 10 MB.");
    expect(report).toContain("Signals:\n- panel/card classes");
    expect(report).toContain("Document:\n- Title: Example Docs");
  });
});
