/**
 * Run the main content view with state, search, palette, copy/open, Tab focus, raw toggle.
 */

import { createCliRenderer, Box, Text } from "@opentui/core";
import type { AnyParsed, InputSource, PreviewInspectInfo } from "../core/models.ts";
import {
  exportSkillBundle,
  renderDocumentForAgent,
  supportsSkillExport,
} from "../core/export.ts";
import { theme } from "./theme.ts";
import { Footer } from "./components/footer.ts";
import type { ShortcutKey } from "./components/footer.ts";
import { CommandPalette } from "./components/command-palette.ts";
import type { AppState } from "./state.ts";
import {
  getSearchableContent,
  runSearch,
  searchMatchToLine,
  initialAppState,
} from "./state.ts";
import { copyToClipboard, openURL } from "../utils/platform.ts";
import { getHeader } from "./app.ts";
import { getScreen } from "./screens/index.ts";
import { wrapText } from "./utils/render-content.ts";

type SelectLike = {
  focus: () => void;
  on: (ev: string, fn: (...args: any[]) => void) => void;
};

export interface ContentAppOptions {
  truncated?: boolean;
  inspectInfo?: PreviewInspectInfo;
  showInspectOnStart?: boolean;
}

export function runContentApp(
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  doc: AnyParsed,
  source: InputSource,
  options?: ContentAppOptions
): void {
  const truncated = options?.truncated ?? false;
  const inspectInfo = options?.inspectInfo;
  const state: AppState = { ...initialAppState };
  const searchableContent = getSearchableContent(doc);
  const canExportSkill = supportsSkillExport(doc);
  let focusables: SelectLike[] = [];
  let rootLayout: ReturnType<typeof Box> | null = null;
  let statusMessage = "";
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let helpOpen = false;
  let inspectOpen = options?.showInspectOnStart ?? false;
  let pendingSkillShortcut = false;
  let pendingSkillTimer: ReturnType<typeof setTimeout> | null = null;

  function showStatus(msg: string, durationMs = 1500) {
    statusMessage = msg;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMessage = "";
      refreshLayout();
    }, durationMs);
    refreshLayout();
  }

  function refreshLayout(): void {
    if (rootLayout && renderer.root.getChildren().length > 0) {
      const first = renderer.root.getChildren()[0];
      if (first) renderer.root.remove(first.id);
    }
    const searchState = state.searchOpen
      ? {
          open: true as const,
          query: state.searchQuery,
          totalMatches: state.searchMatches.length,
          currentIndex: Math.max(0, state.searchIndex),
        }
      : undefined;
    const header = getHeader(doc, source, searchState, statusMessage, truncated, inspectInfo);
    const notices = inspectInfo ? buildContentNotices(doc, source, inspectInfo) : [];
    const noticeBar = notices.length > 0 ? buildNoticeBar(renderer.width, notices) : null;

    let searchScrollLine: number | undefined;
    if (state.searchOpen && state.searchMatches.length > 0 && state.searchIndex >= 0) {
      const charOffset = state.searchMatches[state.searchIndex];
      if (charOffset !== undefined) {
        searchScrollLine = searchMatchToLine(searchableContent, charOffset);
      }
    }

    const screen = getScreen(renderer, doc, {
      jsonViewMode: state.jsonViewMode,
      focusIndex: state.focusIndex,
      searchScrollLine,
    });

    focusables = screen.focusables ?? [];

    for (const sel of focusables) {
      sel.on("itemSelected", (_i: number, opt: { value?: string }) => {
        const val = opt?.value;
        if (typeof val === "string" && /^https?:\/\//i.test(val)) {
          openURL(val);
        }
      });
    }

    const bodySection = Box(
      { flexGrow: 1, flexShrink: 1, overflow: "hidden" },
      screen.body
    );

    const footerKeys: ShortcutKey[] = [...screen.footerKeys];
    if (inspectInfo && !footerKeys.includes("i")) {
      footerKeys.push("i");
    }
    if (canExportSkill && !footerKeys.includes("SK")) {
      footerKeys.push("SK");
    }

    const footer = Footer({ keys: footerKeys });

    const paletteCommands = [
      { name: "Search", description: "Focus search", value: "search" },
      { name: "Copy full content", description: "Copy the extracted content", value: "copy" },
      ...(canExportSkill
        ? [{ name: "Export as skill", description: "Write a skill bundle to disk", value: "skill" }]
        : []),
      ...(inspectInfo
        ? [{ name: "Inspect", description: "Show fetch and detection details", value: "inspect" }]
        : []),
      ...(doc.kind === "json"
        ? [{ name: "Toggle raw JSON", description: "Switch view", value: "raw" }]
        : []),
      { name: "Quit", description: "Exit OpenPreview", value: "quit" },
    ];

    let paletteRow: ReturnType<typeof Box> | null = null;
    let paletteSelect: SelectLike | null = null;
    if (state.paletteOpen) {
      const cp = CommandPalette({ commands: paletteCommands });
      paletteRow = cp.box;
      paletteSelect = cp.select;
      cp.select.on("itemSelected", (_i: number, opt: { value: string }) => {
        if (opt.value === "search") state.searchOpen = true;
        if (opt.value === "copy") void doCopy();
        if (opt.value === "skill") void doExportSkill();
        if (opt.value === "inspect") {
          inspectOpen = true;
          helpOpen = false;
        }
        if (opt.value === "raw") {
          state.jsonViewMode = state.jsonViewMode === "structured" ? "raw" : "structured";
        }
        if (opt.value === "quit") {
          renderer.destroy();
          process.exit(0);
        }
        state.paletteOpen = false;
        refreshLayout();
      });
    }

    let helpOverlay: ReturnType<typeof Box> | null = null;
    if (helpOpen) {
      const bindings = [
        ["q / Esc", "Quit (or close overlay)"],
        ["/", "Open search"],
        ["Esc", "Close search"],
        ["Enter / Ctrl+n", "Next search match"],
        ["N / Ctrl+p", "Previous search match"],
        ["Ctrl+p", "Open command palette"],
        ["Tab", "Cycle focus between panes"],
        ["y", "Copy full content"],
        ["r", "Toggle raw JSON (JSON only)"],
        ["i", "Toggle inspect"],
        ["?", "Toggle this help"],
        ["↑ / ↓", "Navigate list items"],
      ];
      if (canExportSkill) {
        bindings.splice(8, 0, ["s then k", "Export skill bundle"]);
      }
      helpOverlay = Box(
        {
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexGrow: 1,
          paddingY: 2,
        },
        Text({ content: "Keybindings", fg: theme.accent }),
        Text({ content: " ", fg: theme.text }),
        ...bindings.map(([key, desc]) =>
          Box(
            { flexDirection: "row", gap: 2, paddingX: 4 },
            Box({ width: 14 }, Text({ content: key, fg: theme.primary })),
            Text({ content: desc, fg: theme.text }),
          )
        ),
        Text({ content: " ", fg: theme.text }),
        Text({ content: "Press ? or Esc to close", fg: theme.textMuted }),
      );
    }

    const inspectOverlay = inspectOpen && inspectInfo
      ? buildInspectOverlay(doc, source, inspectInfo)
      : null;

    rootLayout = Box(
      {
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.bg,
        gap: 0,
      },
      header,
      ...(noticeBar ? [noticeBar] : []),
      ...(helpOverlay ? [helpOverlay] : inspectOverlay ? [inspectOverlay] : [bodySection]),
      footer,
      ...(paletteRow ? [paletteRow] : []),
    );

    renderer.root.add(rootLayout);

    if (searchScrollLine !== undefined && screen.contentScrollBox) {
      screen.contentScrollBox.scrollTo(searchScrollLine);
    }

    if (state.paletteOpen && paletteSelect) paletteSelect.focus();
    else if (!helpOpen && !inspectOpen && focusables.length > 0) {
      const idx = state.focusIndex % focusables.length;
      focusables[idx]?.focus();
    }
  }

  async function doCopy(): Promise<void> {
    const text = renderDocumentForAgent(doc, source, inspectInfo);
    const ok = await copyToClipboard(text);
    showStatus(ok ? "Copied full content" : "Copy failed");
  }

  async function doExportSkill(): Promise<void> {
    if (!canExportSkill) {
      showStatus("Skill export not available");
      return;
    }

    try {
      const result = await exportSkillBundle(doc, source, inspectInfo);
      const copied = await copyToClipboard(result.savedPath);
      showStatus(
        copied
          ? `Skill saved: ${result.savedLabel} (path copied)`
          : `Skill saved: ${result.savedLabel}`,
        4000,
      );
    } catch (error) {
      showStatus(`Skill export failed: ${(error as Error).message}`, 4000);
    }
  }

  function clearPendingSkillShortcut(): void {
    pendingSkillShortcut = false;
    if (pendingSkillTimer) {
      clearTimeout(pendingSkillTimer);
      pendingSkillTimer = null;
    }
  }

  function armSkillShortcut(): void {
    pendingSkillShortcut = true;
    if (pendingSkillTimer) clearTimeout(pendingSkillTimer);
    pendingSkillTimer = setTimeout(() => {
      pendingSkillShortcut = false;
      pendingSkillTimer = null;
    }, 1200);
    showStatus("Press k to export skill", 1200);
  }

  refreshLayout();
  renderer.keyInput.on("keypress", (key: { name?: string; sequence?: string; ctrl?: boolean }) => {
    if (key.name === "escape" || key.sequence === "\x1b") {
      clearPendingSkillShortcut();
      if (helpOpen) {
        helpOpen = false;
        refreshLayout();
        return;
      }
      if (inspectOpen) {
        inspectOpen = false;
        refreshLayout();
        return;
      }
      if (state.searchOpen) {
        state.searchOpen = false;
        state.searchQuery = "";
        state.searchMatches = [];
        state.searchIndex = 0;
        refreshLayout();
        return;
      }
      if (state.paletteOpen) {
        state.paletteOpen = false;
        refreshLayout();
        return;
      }
      renderer.destroy();
      process.exit(0);
    }

    if (helpOpen) {
      clearPendingSkillShortcut();
      if (key.sequence === "?" || key.name === "q" || key.sequence === "q") {
        helpOpen = false;
        refreshLayout();
      }
      return;
    }

    if (inspectOpen) {
      clearPendingSkillShortcut();
      if (key.sequence === "i" || key.name === "q" || key.sequence === "q") {
        inspectOpen = false;
        refreshLayout();
      }
      return;
    }

    if (state.searchOpen) {
      clearPendingSkillShortcut();
      if (key.name === "backspace") {
        state.searchQuery = state.searchQuery.slice(0, -1);
        state.searchMatches = runSearch(searchableContent, state.searchQuery);
        state.searchIndex = state.searchMatches.length > 0 ? 0 : -1;
        refreshLayout();
        return;
      }
      if ((key.name === "return" || key.sequence === "\r") || (key.name === "n" && key.ctrl)) {
        if (state.searchMatches.length > 0) {
          state.searchIndex = (state.searchIndex + 1) % state.searchMatches.length;
          refreshLayout();
        }
        return;
      }
      if (key.sequence === "N" || (key.name === "p" && key.ctrl)) {
        if (state.searchMatches.length > 0) {
          state.searchIndex =
            (state.searchIndex - 1 + state.searchMatches.length) % state.searchMatches.length;
          refreshLayout();
        }
        return;
      }
      if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        state.searchQuery += key.sequence;
        state.searchMatches = runSearch(searchableContent, state.searchQuery);
        state.searchIndex = state.searchMatches.length > 0 ? 0 : -1;
        refreshLayout();
        return;
      }
      return;
    }

    if (pendingSkillShortcut) {
      if (key.name === "k" || key.sequence === "k" || key.sequence === "K") {
        clearPendingSkillShortcut();
        void doExportSkill();
        return;
      }
      clearPendingSkillShortcut();
    }

    if ((key.name === "q" || key.sequence === "q") && !state.paletteOpen) {
      renderer.destroy();
      process.exit(0);
    }

    if (key.sequence === "?" && !state.paletteOpen) {
      helpOpen = true;
      inspectOpen = false;
      refreshLayout();
      return;
    }

    if ((key.name === "slash" || key.sequence === "/") && !state.paletteOpen) {
      state.searchOpen = true;
      state.searchQuery = "";
      state.searchMatches = [];
      state.searchIndex = 0;
      refreshLayout();
      return;
    }

    if (key.ctrl && (key.name === "p" || key.sequence === "\x10")) {
      state.paletteOpen = true;
      refreshLayout();
      return;
    }

    if ((key.name === "i" || key.sequence === "i") && !state.paletteOpen && inspectInfo) {
      inspectOpen = !inspectOpen;
      helpOpen = false;
      refreshLayout();
      return;
    }

    if ((key.name === "y" || key.sequence === "y") && !state.paletteOpen) {
      void doCopy();
      return;
    }

    if (canExportSkill && !state.paletteOpen && (key.name === "s" || key.sequence === "s" || key.sequence === "S")) {
      armSkillShortcut();
      return;
    }

    if ((key.name === "tab" || key.sequence === "\t") && !state.paletteOpen && focusables.length > 0) {
      state.focusIndex = (state.focusIndex + 1) % focusables.length;
      focusables[state.focusIndex]?.focus();
      return;
    }

    if ((key.name === "r" || key.sequence === "r") && doc.kind === "json" && !state.paletteOpen) {
      state.jsonViewMode = state.jsonViewMode === "structured" ? "raw" : "structured";
      refreshLayout();
      return;
    }
  });
}

function buildInspectOverlay(
  doc: AnyParsed,
  source: InputSource,
  inspectInfo: PreviewInspectInfo,
) {
  const rows = getInspectRows(doc, source, inspectInfo);

  return Box(
    {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flexGrow: 1,
      paddingY: 2,
    },
    Box(
      {
        flexDirection: "column",
        width: 76,
        border: true,
        borderStyle: "rounded",
        borderColor: theme.borderFocus,
        backgroundColor: theme.bgElevated,
        padding: 1,
        gap: 1,
      },
      Text({ content: "Inspect", fg: theme.accent }),
      ...rows.flatMap(([label, value]) => buildInspectRow(label, value)),
      Text({ content: "Press i or Esc to close", fg: theme.textMuted }),
    ),
  );
}

function buildInspectRow(label: string, value: string) {
  const lines = wrapText(value || "(empty)", 54);

  return lines.map((line, index) =>
    Box(
      { flexDirection: "row", gap: 2 },
      Box(
        { width: 16 },
        Text({
          content: index === 0 ? label : "",
          fg: index === 0 ? theme.primary : theme.textMuted,
        }),
      ),
      Text({ content: line, fg: theme.text }),
    ),
  );
}

function getInspectRows(
  doc: AnyParsed,
  source: InputSource,
  inspectInfo: PreviewInspectInfo,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Source", inspectInfo.sourceType],
    ["Input", source.value],
    ["Forced mode", formatModeLabel(inspectInfo.forcedMode)],
    ["Detected mode", formatDetectedMode(inspectInfo.detectedType)],
    ["Parser", formatModeLabel(doc.kind)],
    ["Content-Type", inspectInfo.contentType ?? "(none)"],
    [
      "Bytes",
      `${formatBytes(inspectInfo.displayedBytes)} shown / ${formatBytes(inspectInfo.totalBytes)} fetched`,
    ],
    ["Truncated", inspectInfo.truncated ? "yes" : "no"],
    ["Reason", inspectInfo.detectionSummary],
  ];

  if (inspectInfo.truncationReason) {
    rows.push(["Truncation", inspectInfo.truncationReason]);
  }
  if (inspectInfo.nextAction) {
    rows.push(["Next step", inspectInfo.nextAction]);
  }
  if (inspectInfo.signals.length > 0) {
    rows.push(["Signals", formatSignalList(inspectInfo.signals)]);
  }

  switch (doc.kind) {
    case "docs":
      rows.push(["Sections", String(doc.sections.length)]);
      rows.push(["Links", String(doc.links.length)]);
      rows.push(["Code blocks", String(doc.codeBlocks.length)]);
      break;
    case "dashboard":
      rows.push(["Panels", String(doc.panels.length)]);
      rows.push(["Metrics", String(doc.metrics.length)]);
      rows.push(["Links", String(doc.links.length)]);
      break;
    case "json":
      rows.push(["Summary", doc.schemaSummary]);
      rows.push(["Array of objects", doc.isArrayOfObjects ? "yes" : "no"]);
      break;
    case "markdown":
      rows.push(["Headings", String(doc.headings.length)]);
      rows.push(["Code blocks", String(doc.codeBlocks.length)]);
      break;
    case "github-pr":
      rows.push(["Files", String(doc.files.length)]);
      rows.push(["Comments", String(doc.comments.length)]);
      break;
    case "text":
      rows.push(["Lines", String(doc.content.split("\n").length)]);
      rows.push(["Characters", String(doc.content.length)]);
      break;
  }

  return rows;
}

function formatModeLabel(mode: string): string {
  switch (mode) {
    case "github-pr":
      return "GitHub PR";
    case "json":
      return "JSON";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}

function formatDetectedMode(type: PreviewInspectInfo["detectedType"]): string {
  return type === "html" ? "Docs" : formatModeLabel(type);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ContentNotice = {
  level: "info" | "warning";
  message: string;
};

function buildContentNotices(
  doc: AnyParsed,
  source: InputSource,
  inspectInfo: PreviewInspectInfo,
): ContentNotice[] {
  const notices: ContentNotice[] = [];

  if (inspectInfo.truncationReason) {
    notices.push({
      level: "warning",
      message: inspectInfo.truncationReason,
    });
  }

  if (doc.kind === "dashboard" && inspectInfo.forcedMode === "auto") {
    notices.push({
      level: "info",
      message: [inspectInfo.detectionSummary, inspectInfo.nextAction].filter(Boolean).join(" "),
    });
  } else if (inspectInfo.jsHeavy) {
    notices.push({
      level: "warning",
      message: [inspectInfo.detectionSummary, inspectInfo.nextAction].filter(Boolean).join(" "),
    });
  } else if (
    doc.kind === "docs" &&
    source.type === "url" &&
    doc.sections.length === 0 &&
    doc.mainContent === "No readable content found."
  ) {
    notices.push({
      level: "warning",
      message:
        "OpenPreview fetched the HTML but could not find readable content. This page may require client-side rendering. Try a docs/article URL, save the rendered HTML, or rerun with `preview --mode text <url>`.",
    });
  }

  return notices;
}

function buildNoticeBar(width: number, notices: ContentNotice[]) {
  const contentWidth = Math.max(24, width - 8);

  return Box(
    {
      flexDirection: "column",
      paddingX: 2,
      paddingY: 1,
      backgroundColor: theme.bgElevated,
      gap: 0,
    },
    ...notices.flatMap((notice) => {
      const lines = wrapText(notice.message, contentWidth);
      const prefix = notice.level === "warning" ? "Warning" : "Info";
      const prefixColor = notice.level === "warning" ? theme.warning : theme.primary;

      return lines.map((line, lineIndex) =>
        Box(
          { flexDirection: "row", gap: 2 },
          Box(
            { width: 8 },
            Text({
              content: lineIndex === 0 ? prefix : "",
              fg: lineIndex === 0 ? prefixColor : theme.textMuted,
            }),
          ),
          Text({ content: line, fg: theme.textMuted }),
        ),
      );
    }),
    Box(
      { width: "100%", height: 1 },
      Text({ content: "─".repeat(200), fg: theme.borderSubtle }),
    ),
  );
}

function formatSignalList(signals: PreviewInspectInfo["signals"]): string {
  const matched = signals.filter((signal) => signal.matched);
  if (matched.length === 0) return "No matched signals recorded.";
  return matched
    .map((signal) => (signal.detail ? `${signal.name} (${signal.detail})` : signal.name))
    .join(", ");
}
