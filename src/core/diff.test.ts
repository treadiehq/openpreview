import { describe, expect, test } from "bun:test";
import { buildPreviewDiff } from "./diff.ts";
import type { LoadedPreview } from "./preview-session.ts";

describe("buildPreviewDiff", () => {
  test("compares json payloads by path", () => {
    const left: LoadedPreview = {
      doc: {
        kind: "json",
        root: { id: 1, status: "ok" },
        schemaSummary: "object: id, status",
        isArrayOfObjects: false,
        node: null,
        classification: "object",
        entries: [],
        anomalies: [],
      },
      source: { type: "file", value: "left.json", label: "left.json" },
      detected: {
        type: "json",
        raw: '{"id":1,"status":"ok"}',
        source: { type: "file", value: "left.json", label: "left.json" },
      },
      inspectInfo: {
        sourceType: "file",
        forcedMode: "json",
        detectedType: "json",
        totalBytes: 24,
        displayedBytes: 24,
        truncated: false,
        detectionSummary: "Detected JSON.",
        signals: [],
        jsHeavy: false,
      },
    };

    const right: LoadedPreview = {
      doc: {
        kind: "json",
        root: { id: 1, status: "error", retry: true },
        schemaSummary: "object: id, status, retry",
        isArrayOfObjects: false,
        node: null,
        classification: "object",
        entries: [],
        anomalies: [],
      },
      source: { type: "file", value: "right.json", label: "right.json" },
      detected: {
        type: "json",
        raw: '{"id":1,"status":"error","retry":true}',
        source: { type: "file", value: "right.json", label: "right.json" },
      },
      inspectInfo: {
        sourceType: "file",
        forcedMode: "json",
        detectedType: "json",
        totalBytes: 39,
        displayedBytes: 39,
        truncated: false,
        detectionSummary: "Detected JSON.",
        signals: [],
        jsHeavy: false,
      },
    };

    const diff = buildPreviewDiff(left, right);
    expect(diff.kind).toBe("diff");
    expect(diff.entries.some((entry) => entry.title === "status")).toBe(true);
    expect(diff.entries.some((entry) => entry.title === "retry" && entry.status === "added")).toBe(true);
  });

  test("compares text when kinds differ", () => {
    const left: LoadedPreview = {
      doc: { kind: "text", content: "hello", source: { type: "file", value: "left.txt" } },
      source: { type: "file", value: "left.txt", label: "left.txt" },
      detected: {
        type: "text",
        raw: "hello",
        source: { type: "file", value: "left.txt", label: "left.txt" },
      },
      inspectInfo: {
        sourceType: "file",
        forcedMode: "text",
        detectedType: "text",
        totalBytes: 5,
        displayedBytes: 5,
        truncated: false,
        detectionSummary: "text",
        signals: [],
        jsHeavy: false,
      },
    };

    const right: LoadedPreview = {
      doc: { kind: "markdown", raw: "# hello", content: "# hello", title: "hello", headings: [], codeBlocks: [] },
      source: { type: "file", value: "right.md", label: "right.md" },
      detected: {
        type: "markdown",
        raw: "# hello",
        source: { type: "file", value: "right.md", label: "right.md" },
      },
      inspectInfo: {
        sourceType: "file",
        forcedMode: "markdown",
        detectedType: "markdown",
        totalBytes: 7,
        displayedBytes: 7,
        truncated: false,
        detectionSummary: "markdown",
        signals: [],
        jsHeavy: false,
      },
    };

    const diff = buildPreviewDiff(left, right);
    expect(diff.entries[0]?.title).toBe("Parsed mode changed");
  });
});
