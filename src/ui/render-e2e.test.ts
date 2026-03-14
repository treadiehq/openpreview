import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { loadPreview } from "../core/preview-session.ts";
import { runContentApp } from "./run-content.ts";

describe("content rendering", () => {
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
        expect(frame).toContain("PlanetScale brings you the fastest databases");
        expect(frame).toContain("Our blazing fast NVMe drives unlock");
      } finally {
        renderer.destroy();
      }
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
