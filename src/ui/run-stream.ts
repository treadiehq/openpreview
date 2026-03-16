import { Box, Text, type createCliRenderer } from "@opentui/core";
import { detectContentType } from "../core/detect.ts";
import { MAX_CONTENT_SIZE_BYTES, MAX_CONTENT_SIZE_LABEL } from "../core/fetch.ts";
import { parse } from "../core/parse/index.ts";
import { appendStreamChunk, createEmptyStreamBuffer } from "../core/stream-buffer.ts";
import type { AnyParsed, ContentType, InputSource, PreviewMode } from "../core/models.ts";
import { copyToClipboard } from "../utils/platform.ts";
import { Footer } from "./components/footer.ts";
import type { ShortcutKey } from "./components/footer.ts";
import { Header } from "./components/header.ts";
import { openTerminalInputStream } from "./terminal-input.ts";
import { getScreen } from "./screens/index.ts";
import { theme } from "./theme.ts";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;
type SelectLike = {
  focus: () => void;
  on: (ev: string, fn: (...args: any[]) => void) => void;
};

export interface RunStreamAppOptions {
  mode?: PreviewMode;
  maxBufferBytes?: number;
}

export function runStreamApp(
  renderer: Renderer,
  source: InputSource,
  options?: RunStreamAppOptions,
): void {
  const forcedMode = options?.mode ?? "auto";
  const maxBufferBytes = options?.maxBufferBytes ?? MAX_CONTENT_SIZE_BYTES;

  let buffer = createEmptyStreamBuffer();
  let statusMessage = "";
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let helpOpen = false;
  let ended = false;
  let streamError: string | null = null;
  let refreshScheduled = false;
  let refreshInFlight = false;
  let needsRefresh = false;
  let renderRevision = 0;
  let destroyed = false;
  const terminalKeyInput = openTerminalInputStream();

  const onData = (chunk: string | Buffer) => {
    buffer = appendStreamChunk(buffer, String(chunk), maxBufferBytes);
    scheduleRefresh();
  };

  const onEnd = () => {
    ended = true;
    scheduleRefresh();
  };

  const onError = (error: Error) => {
    streamError = error.message;
    scheduleRefresh();
  };

  const onTerminalKeyData = (chunk: string | Buffer) => {
    const key = String(chunk);
    if (key.length !== 1) {
      return;
    }

    if (key === "\x1b") {
      if (helpOpen) {
        helpOpen = false;
        scheduleRefresh();
        return;
      }
      destroyAndExit();
      return;
    }

    if (key === "q" && !helpOpen) {
      destroyAndExit();
      return;
    }

    if (key === "?") {
      helpOpen = !helpOpen;
      scheduleRefresh();
      return;
    }

    if (key === "y" && !helpOpen) {
      void copyCurrentBuffer();
    }
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onData);
  process.stdin.on("end", onEnd);
  process.stdin.on("error", onError);
  process.stdin.resume();
  if (terminalKeyInput) {
    terminalKeyInput.stdin.setEncoding?.("utf8");
    terminalKeyInput.stdin.on("data", onTerminalKeyData);
    terminalKeyInput.stdin.resume();
  }

  scheduleRefresh();

  async function copyCurrentBuffer(): Promise<void> {
    const ok = await copyToClipboard(buffer.content);
    showStatus(ok ? "Copied streamed content" : "Copy failed");
  }

  function showStatus(message: string, durationMs = 1500): void {
    statusMessage = message;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMessage = "";
      scheduleRefresh();
    }, durationMs);
    scheduleRefresh();
  }

  function scheduleRefresh(): void {
    if (refreshScheduled) return;
    refreshScheduled = true;
    setTimeout(() => {
      refreshScheduled = false;
      void refreshLayout();
    }, 75);
  }

  async function refreshLayout(): Promise<void> {
    if (destroyed) return;
    if (refreshInFlight) {
      needsRefresh = true;
      return;
    }

    refreshInFlight = true;
    const revision = ++renderRevision;

    const snapshot = buffer;
    const view = await buildStreamView(renderer, snapshot.content, source, forcedMode, ended, streamError);

    if (destroyed || revision !== renderRevision) {
      refreshInFlight = false;
      if (needsRefresh) {
        needsRefresh = false;
        void refreshLayout();
      }
      return;
    }

    const modeLabel = `${forcedMode === "auto" ? "Detected" : "Forced"}: ${formatModeLabel(
      forcedMode === "auto" ? view.detectedType : forcedMode,
    )}`;
    const header = Header({
      title: getStreamTitle(view.doc),
      sourceLabel: source.label ?? source.value,
      subtitle: buildSubtitle(view.doc, snapshot, ended, streamError, Boolean(terminalKeyInput)),
      status: statusMessage || (streamError ? `Stream error: ${streamError}` : ended ? "Stream ended" : undefined),
      modeLabel,
    });

    const body = helpOpen ? buildHelpOverlay() : view.body;
    const footerKeys: ShortcutKey[] = terminalKeyInput ? ["q", "y", "?"] : [];

    for (const child of renderer.root.getChildren()) renderer.root.remove(child.id);
    renderer.root.add(
      Box(
        {
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: theme.bg,
          gap: 0,
        },
        header,
        Box({ flexGrow: 1, flexShrink: 1, overflow: "hidden" }, body),
        Footer({ keys: footerKeys }),
      ),
    );
    if ((view.doc.kind === "log" || view.doc.kind === "text") && view.contentScrollBox) {
      view.contentScrollBox.scrollTo(Number.MAX_SAFE_INTEGER);
    }

    refreshInFlight = false;
    if (needsRefresh) {
      needsRefresh = false;
      void refreshLayout();
    }
  }

  function destroyAndExit(): void {
    destroyed = true;
    if (statusTimer) clearTimeout(statusTimer);
    process.stdin.off("data", onData);
    process.stdin.off("end", onEnd);
    process.stdin.off("error", onError);
    if (terminalKeyInput) {
      terminalKeyInput.stdin.off("data", onTerminalKeyData);
      terminalKeyInput.cleanup?.();
      if ("destroyed" in terminalKeyInput.stdin && !terminalKeyInput.stdin.destroyed) {
        terminalKeyInput.stdin.destroy();
      }
    }
    renderer.destroy();
    process.exit(0);
  }
}

async function buildStreamView(
  renderer: Renderer,
  content: string,
  source: InputSource,
  forcedMode: PreviewMode,
  ended: boolean,
  streamError: string | null,
) {
  const normalized = content || "";
  const detected = detectContentType(normalized, source, undefined, forcedMode);
  const doc = normalized
    ? await parse(detected)
    : ({
        kind: "text",
        content: ended
          ? streamError
            ? `Stream error: ${streamError}`
            : "No streamed content received."
          : "Waiting for streamed input...",
        source,
      } as AnyParsed);

  if (!normalized && !ended && !streamError) {
    return {
      doc,
      detectedType: forcedMode === "auto" ? "text" as ContentType : previewModeToType(forcedMode),
      body: buildWaitingBody(),
      focusables: [] as SelectLike[],
      contentScrollBox: undefined,
    };
  }

  const screen = getScreen(
    renderer,
    doc,
  );

  return {
    doc,
    detectedType: detected.type,
    ...screen,
  };
}

function buildWaitingBody() {
  return Box(
    {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flexGrow: 1,
      paddingY: 2,
    },
    Text({ content: "Waiting for streamed input...", fg: theme.textMuted }),
  );
}

function buildHelpOverlay() {
  const bindings = [
    ["q / Esc", "Quit"],
    ["y", "Copy the current buffered stream"],
    ["?", "Toggle this help"],
  ];

  return Box(
    {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flexGrow: 1,
      paddingY: 2,
    },
    Text({ content: "Follow Mode", fg: theme.accent }),
    Text({ content: " ", fg: theme.text }),
    ...bindings.map(([key, description]) =>
      Box(
        { flexDirection: "row", gap: 2, paddingX: 4 },
        Box({ width: 12 }, Text({ content: key, fg: theme.primary })),
        Text({ content: description, fg: theme.text }),
      ),
    ),
    Text({ content: " ", fg: theme.text }),
    Text({ content: `Buffer is capped at the last ${MAX_CONTENT_SIZE_LABEL}.`, fg: theme.textMuted }),
  );
}

function buildSubtitle(
  doc: AnyParsed,
  buffer: { totalBytes: number; displayedBytes: number; truncated: boolean },
  ended: boolean,
  streamError: string | null,
  hasTerminalShortcuts: boolean,
): string {
  const summary = (() => {
    switch (doc.kind) {
      case "log":
        return `${doc.entries.length} entries`;
      case "table":
        return `${doc.rows.length} rows · ${doc.columns.length} columns`;
      case "docs":
        return `${doc.sections.length} sections`;
      case "markdown":
        return `${doc.headings.length} headings`;
      case "json":
        return doc.schemaSummary;
      case "github-pr":
        return `${doc.files.length} files · ${doc.comments.length} comments`;
      case "dashboard":
        return `${doc.panels.length} panels`;
      default:
        return `${doc.content.split("\n").filter(Boolean).length} lines`;
    }
  })();

  const parts = [
    summary,
    `${formatBytes(buffer.displayedBytes)} shown / ${formatBytes(buffer.totalBytes)} received`,
  ];

  if (buffer.truncated) {
    parts.push(`showing last ${MAX_CONTENT_SIZE_LABEL}`);
  } else if (streamError) {
    parts.push("stream error");
  } else {
    parts.push(ended ? "stream ended" : "streaming");
  }

  if (!hasTerminalShortcuts) {
    parts.push("Ctrl+C to quit");
  }

  return parts.join(" · ");
}

function getStreamTitle(doc: AnyParsed): string {
  switch (doc.kind) {
    case "log":
      return "Live log stream";
    case "table":
      return "Live table stream";
    case "docs":
      return doc.title || "Live docs stream";
    case "markdown":
      return doc.title || "Live markdown stream";
    case "json":
      return "Live JSON stream";
    case "github-pr":
      return doc.title || "Live GitHub PR stream";
    case "dashboard":
      return doc.title || "Live dashboard stream";
    default:
      return "Live text stream";
  }
}

function previewModeToType(mode: PreviewMode): ContentType {
  if (mode === "docs") return "html";
  if (mode === "auto") return "text";
  return mode;
}

function formatModeLabel(mode: string): string {
  switch (mode) {
    case "html":
    case "docs":
      return "Docs";
    case "github-pr":
      return "GitHub PR";
    case "json":
      return "JSON";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
