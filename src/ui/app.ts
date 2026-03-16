/**
 * Main app: create renderer, load content, mount the right screen.
 * Handles welcome (no input), loading, error, and mode-specific screens.
 */

import { createCliRenderer, Box } from "@opentui/core";
import type { AnyParsed, InputSource, PreviewInspectInfo, PreviewMode } from "../core/models.ts";
import { VERSION } from "../core/version.ts";
import { theme } from "./theme.ts";
import { Header } from "./components/header.ts";
import { Footer } from "./components/footer.ts";
import { WelcomeScreen } from "./screens/welcome.ts";
import { LoadingScreen, SPINNER_FRAME_COUNT } from "./screens/loading.ts";
import { ErrorScreen } from "./screens/error.ts";
import { loadPreview, type LoadedPreview } from "../core/preview-session.ts";
import { isEscapeKey, isPlainKey, type KeyPressLike } from "./key-events.ts";
import { getRendererInputConfig } from "./terminal-input.ts";

export interface RunAppOptions {
  mode?: PreviewMode;
  inspect?: boolean;
  follow?: boolean;
}

export async function runApp(input: InputSource | null, options?: RunAppOptions): Promise<void> {
  const forcedMode = options?.mode ?? "auto";
  const showInspectOnStart = options?.inspect ?? false;
  const follow = options?.follow ?? false;

  if (!input) {
    const renderer = await createCliRenderer({ exitOnCtrlC: true, useAlternateScreen: true });
    setupQuitKeys(renderer);
    const layout = buildLayout(renderer, WelcomeScreen(renderer.width), undefined, {
      footerVariant: "welcome",
      version: VERSION,
      noHeader: true,
    });
    renderer.root.add(layout);
    return;
  }

  if (input.type === "stdin") {
    if (follow) {
      const renderer = await createCliRenderer({ exitOnCtrlC: true, useAlternateScreen: true });
      const { runStreamApp } = await import("./run-stream.ts");
      runStreamApp(renderer, input, { mode: forcedMode });
      return;
    }

    const rendererInputConfig = getRendererInputConfig(input);

    let loaded: LoadedPreview;
    try {
      loaded = await loadPreview(input, forcedMode);
    } catch (e) {
      const renderer = await createCliRenderer({
        exitOnCtrlC: true,
        useAlternateScreen: true,
        ...rendererInputConfig,
      });
      setupQuitKeys(renderer);
      renderer.root.add(buildLayout(renderer, ErrorScreen((e as Error).message)));
      return;
    }

    const renderer = await createCliRenderer({
      exitOnCtrlC: true,
      useAlternateScreen: true,
      ...rendererInputConfig,
    });
    setupQuitKeys(renderer);
    const { runContentApp } = await import("./run-content.ts");
    runContentApp(renderer, loaded.doc, loaded.source, {
      truncated: loaded.inspectInfo.truncated,
      inspectInfo: loaded.inspectInfo,
      showInspectOnStart,
    });
    return;
  }

  {
    const renderer = await createCliRenderer({ exitOnCtrlC: true, useAlternateScreen: true });
    const quitHandler = (key: KeyPressLike) => {
      if (isPlainKey(key, "q") || isEscapeKey(key)) {
        renderer.destroy();
        process.exit(0);
      }
    };
    renderer.keyInput.on("keypress", quitHandler);
    let spinnerFrame = 0;
    let loadingLayout = buildLayout(renderer, LoadingScreen(0));
    renderer.root.add(loadingLayout);
    const spinnerInterval = setInterval(() => {
      spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAME_COUNT;
      for (const child of renderer.root.getChildren()) renderer.root.remove(child.id);
      loadingLayout = buildLayout(renderer, LoadingScreen(spinnerFrame));
      renderer.root.add(loadingLayout);
    }, 80);
    let loaded: LoadedPreview;
    try {
      loaded = await loadPreview(input, forcedMode);
    } catch (e) {
      clearInterval(spinnerInterval);
      for (const child of renderer.root.getChildren()) renderer.root.remove(child.id);
      renderer.root.add(buildLayout(renderer, ErrorScreen((e as Error).message)));
      return;
    }
    clearInterval(spinnerInterval);
    for (const child of renderer.root.getChildren()) renderer.root.remove(child.id);
    renderer.keyInput.off("keypress", quitHandler);
    const { runContentApp } = await import("./run-content.ts");
    runContentApp(renderer, loaded.doc, loaded.source, {
      truncated: loaded.inspectInfo.truncated,
      inspectInfo: loaded.inspectInfo,
      showInspectOnStart,
    });
    return;
  }
}

function buildLayout(
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  body: ReturnType<typeof Box>,
  header?: ReturnType<typeof Box> | undefined,
  opts?: { footerVariant?: "shortcuts" | "status" | "welcome"; version?: string; noHeader?: boolean }
) {
  const footerOpts =
    opts?.footerVariant === "status"
      ? { variant: "status" as const, version: opts.version }
      : opts?.footerVariant === "welcome"
        ? { variant: "welcome" as const, version: opts.version }
        : undefined;
  const headerNode =
    opts?.noHeader === true ? null : header ?? Header({ title: "OpenPreview" });
  return Box(
    {
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: theme.bg,
      gap: 0,
    },
    ...(headerNode ? [headerNode] : []),
    Box({ flexGrow: 1, flexShrink: 1, overflow: "hidden" }, body),
    Footer(footerOpts)
  );
}

import type { HeaderSearchState } from "./components/header.ts";

export function getHeader(
  doc: AnyParsed,
  source: InputSource,
  search?: HeaderSearchState,
  status?: string,
  truncated?: boolean,
  inspectInfo?: PreviewInspectInfo,
): ReturnType<typeof Box> {
  const label = source.label ?? source.value;
  const truncSuffix = truncated ? " (truncated)" : "";
  const modeLabel =
    inspectInfo
      ? `${inspectInfo.forcedMode === "auto" ? "Detected" : "Forced"}: ${formatModeLabel(
          inspectInfo.forcedMode === "auto" ? inspectInfo.detectedType : inspectInfo.forcedMode,
        )}`
      : undefined;
  const base = (() => {
    switch (doc.kind) {
      case "docs":
        return { title: doc.title, subtitle: doc.description, sourceLabel: (doc.url || label) + truncSuffix };
      case "json":
        return { title: doc.schemaSummary, sourceLabel: label + truncSuffix };
      case "markdown":
        return { title: doc.title ?? "Markdown", sourceLabel: label + truncSuffix };
      case "github-pr":
        return { title: doc.title, subtitle: doc.author ? `by ${doc.author}` : undefined, sourceLabel: label + truncSuffix };
      case "dashboard":
        return { title: doc.title, sourceLabel: label + truncSuffix };
      case "table":
        return {
          title: "Table",
          subtitle: `${doc.rows.length} rows · ${doc.columns.length} columns`,
          sourceLabel: label + truncSuffix,
        };
      case "log":
        return {
          title: "Log output",
          subtitle: `${doc.entries.length} entries · ${formatLogCounts(doc.counts)}`,
          sourceLabel: label + truncSuffix,
        };
      default:
        return { title: "Text", sourceLabel: label + truncSuffix };
    }
  })();
  return Header({ ...base, search, status, modeLabel });
}

function setupQuitKeys(renderer: Awaited<ReturnType<typeof createCliRenderer>>) {
  renderer.keyInput.on("keypress", (key: KeyPressLike) => {
    if (isPlainKey(key, "q") || isEscapeKey(key)) {
      renderer.destroy();
      process.exit(0);
    }
  });
}

function formatModeLabel(mode: string): string {
  switch (mode) {
    case "html":
    case "docs":
      return "Docs";
    case "json":
      return "JSON";
    case "github-pr":
      return "GitHub PR";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}

function formatLogCounts(counts: { error: number; warn: number; info: number; debug: number }): string {
  const parts = [
    counts.error > 0 ? `ERROR ${counts.error}` : "",
    counts.warn > 0 ? `WARN ${counts.warn}` : "",
    counts.info > 0 ? `INFO ${counts.info}` : "",
    counts.debug > 0 ? `DEBUG ${counts.debug}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "mixed levels";
}
