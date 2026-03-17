import { describe, expect, test } from "bun:test";
import { Box } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { buildPreviewDiff } from "../core/diff.ts";
import { loadPreview } from "../core/preview-session.ts";
import { VERSION } from "../core/version.ts";
import { Footer } from "./components/footer.ts";
import { runContentApp } from "./run-content.ts";
import { WelcomeScreen } from "./screens/welcome.ts";

describe("content rendering", () => {
  test("renders the welcome screen cleanly at multiple terminal widths", async () => {
    for (const width of [68, 92, 132]) {
      const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
        width,
        height: 32,
      });

      try {
        renderer.root.add(
          Box(
            { flexDirection: "column", width: "100%", height: "100%" },
            Box({ flexGrow: 1, flexShrink: 1 }, WelcomeScreen(width)),
            Footer({ variant: "welcome", version: VERSION }),
          ),
        );

        await renderOnce();
        const frame = captureCharFrame();

        expect(frame).toContain("Usage");
        expect(frame).toContain("preview <url>");
        expect(frame).toContain("Preview a web page");
        expect(frame).toContain("Preview a local file");
        expect(frame).toContain("cat file | preview");
        expect(frame).toContain("Preview an API response");
        expect(frame).toContain("Preview log output");
        expect(frame).toContain("Compare two captures");
        expect(frame).toContain(VERSION);
      } finally {
        renderer.destroy();
      }
    }
  });

  test("renders the docs view at multiple terminal widths without cutting the main content", async () => {
    for (const width of [80, 120]) {
      const loaded = await loadPreview({
        type: "file",
        value: "fixtures/regression-planetscale.html",
        label: "regression-planetscale.html",
      });

      const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
        width,
        height: 32,
      });

      try {
        runContentApp(renderer, loaded.doc, loaded.source, {
          truncated: loaded.inspectInfo.truncated,
          inspectInfo: loaded.inspectInfo,
        });

        await renderOnce();
        const frame = captureCharFrame();

        expect(frame).toContain("Detected:");
        expect(frame).toContain("Docs");
        expect(frame).toContain("SK");
        expect(frame).toContain("PlanetScale brings you the fastest databases");
        expect(frame).toContain("Our blazing fast NVMe drives unlock");
      } finally {
        renderer.destroy();
      }
    }
  });

  test("only shows the skill footer action for supported content", async () => {
    const jsonLoaded = await loadPreview({
      type: "file",
      value: "fixtures/sample.json",
      label: "sample.json",
    });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 96,
      height: 28,
    });

    try {
      runContentApp(renderer, jsonLoaded.doc, jsonLoaded.source, {
        truncated: jsonLoaded.inspectInfo.truncated,
        inspectInfo: jsonLoaded.inspectInfo,
      });

      await renderOnce();
      const frame = captureCharFrame();

      expect(frame).not.toContain("SK");
    } finally {
      renderer.destroy();
    }
  });

  test("renders dashboard detection notices and the inspect overlay", async () => {
    const loaded = await loadPreview({
      type: "file",
      value: "fixtures/sample-dashboard.html",
      label: "sample-dashboard.html",
    });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 96,
      height: 32,
    });

    try {
      runContentApp(renderer, loaded.doc, loaded.source, {
        truncated: loaded.inspectInfo.truncated,
        inspectInfo: loaded.inspectInfo,
        showInspectOnStart: true,
      });

      await renderOnce();
      const frame = captureCharFrame();

      expect(frame).toContain("Detected mode");
      expect(frame).toContain("Dashboard");
      expect(frame).toContain("metric/stat classes");
      expect(frame).toContain("Next step");
    } finally {
      renderer.destroy();
    }
  });

  test("shows the dashboard notice bar in the standard content view", async () => {
    const loaded = await loadPreview({
      type: "file",
      value: "fixtures/sample-dashboard.html",
      label: "sample-dashboard.html",
    });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 100,
      height: 28,
    });

    try {
      runContentApp(renderer, loaded.doc, loaded.source, {
        truncated: loaded.inspectInfo.truncated,
        inspectInfo: loaded.inspectInfo,
      });

      await renderOnce();
      const frame = captureCharFrame();

      expect(frame).toContain("Detected:");
      expect(frame).toContain("Dashboard");
      expect(frame).toContain("Info");
      expect(frame).toContain("Detected Dashboard mode from HTML");
      expect(frame).toContain("metric/status signals");
    } finally {
      renderer.destroy();
    }
  });

  test("renders detected table output from cli text", async () => {
    const loaded = await loadPreview({
      type: "file",
      value: "fixtures/sample-table.txt",
      label: "sample-table.txt",
    });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 108,
      height: 28,
    });

    try {
      runContentApp(renderer, loaded.doc, loaded.source, {
        truncated: loaded.inspectInfo.truncated,
        inspectInfo: loaded.inspectInfo,
      });

      await renderOnce();
      const frame = captureCharFrame();

      expect(frame).toContain("Detected:");
      expect(frame).toContain("Table");
      expect(frame).toContain("Row 1 of 3");
      expect(frame).toContain("COMMAND");
      expect(frame).toContain("/sbin/init");
    } finally {
      renderer.destroy();
    }
  });

  test("renders detected logs with filter sidebar", async () => {
    const loaded = await loadPreview({
      type: "file",
      value: "fixtures/sample-log.txt",
      label: "sample-log.txt",
    });

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 110,
      height: 28,
    });

    try {
      runContentApp(renderer, loaded.doc, loaded.source, {
        truncated: loaded.inspectInfo.truncated,
        inspectInfo: loaded.inspectInfo,
      });

      await renderOnce();
      const frame = captureCharFrame();

      expect(frame).toContain("Detected:");
      expect(frame).toContain("Log");
      expect(frame).toContain("All (4)");
      expect(frame).toContain("ERROR");
      expect(frame).toContain("Failed to parse page");
    } finally {
      renderer.destroy();
    }
  });

  test("renders the diff screen", async () => {
    const left = await loadPreview({
      type: "file",
      value: "fixtures/sample-log.txt",
      label: "sample-log.txt",
    });
    const right = await loadPreview({
      type: "file",
      value: "fixtures/sample-table.txt",
      label: "sample-table.txt",
    });
    const diff = buildPreviewDiff(left, right);

    const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
      width: 110,
      height: 28,
    });

    try {
      runContentApp(renderer, diff, { type: "file", value: "diff", label: "comparison" });
      await renderOnce();
      const frame = captureCharFrame();

      expect(frame).toContain("Preview diff");
      expect(frame).toContain("Parsed mode changed");
      expect(frame).toContain("sample-log.txt");
      expect(frame).toContain("sample-table.txt");
    } finally {
      renderer.destroy();
    }
  });
});
