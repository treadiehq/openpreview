import { describe, expect, test } from "bun:test";
import { Box } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
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
        expect(frame).toContain("Print detection and");
        expect(frame).toContain("fetch details");
        expect(frame).toContain("Preview a GitHub PR");
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
      expect(frame).toContain("panel/card classes");
    } finally {
      renderer.destroy();
    }
  });
});
