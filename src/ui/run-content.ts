/**
 * Run the main content view with state, search, palette, copy/open, Tab focus, raw toggle.
 */

import { createCliRenderer, Box, Text } from "@opentui/core";
import { loadPreview } from "../core/preview-session.ts";
import type { AnyParsed, InputSource, PreviewInspectInfo, PreviewMode } from "../core/models.ts";
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
import { isEscapeKey, isPlainKey, isTabKey, type KeyPressLike } from "./key-events.ts";
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
  forcedMode?: PreviewMode;
}

export function runContentApp(
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  doc: AnyParsed,
  source: InputSource,
  options?: ContentAppOptions
): void {
  const state: AppState = { ...initialAppState };
  let currentDoc = doc;
  let currentSource = source;
  let currentInspectInfo = options?.inspectInfo;
  let currentTruncated = options?.truncated ?? false;
  let currentScreen: ReturnType<typeof getScreen> | null = null;
  let focusables: SelectLike[] = [];
  let rootLayout: ReturnType<typeof Box> | null = null;
  let statusMessage = "";
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let helpOpen = false;
  let inspectOpen = options?.showInspectOnStart ?? false;
  let pendingSkillShortcut = false;
  let pendingSkillTimer: ReturnType<typeof setTimeout> | null = null;
  const navigationHistory: Array<{
    doc: AnyParsed;
    source: InputSource;
    inspectInfo?: PreviewInspectInfo;
    truncated: boolean;
  }> = [];
  const previewCache = new Map<
    string,
    {
      doc: AnyParsed;
      source: InputSource;
      inspectInfo?: PreviewInspectInfo;
      truncated: boolean;
    }
  >();

  if (currentSource.type === "url") {
    previewCache.set(currentSource.value, {
      doc: currentDoc,
      source: currentSource,
      inspectInfo: currentInspectInfo,
      truncated: currentTruncated,
    });
  }

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
    const searchableContent = getSearchableContent(currentDoc);
    const canExportSkill = supportsSkillExport(currentDoc);
    const searchState = state.searchOpen
      ? {
          open: true as const,
          query: state.searchQuery,
          totalMatches: state.searchMatches.length,
          currentIndex: Math.max(0, state.searchIndex),
        }
      : undefined;
    const header = getHeader(currentDoc, currentSource, searchState, statusMessage, currentTruncated, currentInspectInfo);
    const notices = currentInspectInfo ? buildContentNotices(currentDoc, currentSource, currentInspectInfo) : [];
    const noticeBar = notices.length > 0 ? buildNoticeBar(renderer.width, notices) : null;

    let searchScrollLine: number | undefined;
    if (state.searchOpen && state.searchMatches.length > 0 && state.searchIndex >= 0) {
      const charOffset = state.searchMatches[state.searchIndex];
      if (charOffset !== undefined) {
        searchScrollLine = searchMatchToLine(searchableContent, charOffset);
      }
    }

    const screen = getScreen(renderer, currentDoc, {
      jsonViewMode: state.jsonViewMode,
      focusIndex: state.focusIndex,
      searchScrollLine,
    });
    currentScreen = screen;

    focusables = screen.focusables ?? [];

    focusables.forEach((sel, index) => {
      sel.on("itemSelected", (_i: number, opt: { value?: string }) => {
        const target = screen.getOpenTarget?.(index);
        if (target && /^https?:\/\//i.test(target)) {
          void navigateToUrl(target);
          return;
        }
        const external = screen.getExternalUrl?.(index);
        if (external && /^https?:\/\//i.test(external)) {
          openURL(external);
          return;
        }
        const val = opt?.value;
        if (typeof val === "string" && /^https?:\/\//i.test(val)) {
          openURL(val);
        }
      });
    });

    const bodySection = Box(
      { flexGrow: 1, flexShrink: 1, overflow: "hidden" },
      screen.body
    );

    const footerKeys: ShortcutKey[] = [...screen.footerKeys];
    if (currentInspectInfo && !footerKeys.includes("i")) {
      footerKeys.push("i");
    }
    if (canExportSkill && !footerKeys.includes("SK")) {
      footerKeys.push("SK");
    }
    if (navigationHistory.length > 0 && !footerKeys.includes("b")) {
      footerKeys.push("b");
    }
    if ((screen.getExternalUrl?.(state.focusIndex) || currentSource.type === "url") && !footerKeys.includes("o")) {
      footerKeys.push("o");
    }
    if (!footerKeys.includes("Y")) {
      footerKeys.push("Y");
    }

    const footer = Footer({ keys: footerKeys });

    const paletteCommands = [
      { name: "Search", description: "Focus search", value: "search" },
      { name: "Copy current item", description: "Copy the focused item or section", value: "copy" },
      { name: "Copy full content", description: "Copy the full extracted content", value: "copy-all" },
      ...(canExportSkill
        ? [{ name: "Export as skill", description: "Write a skill bundle to disk", value: "skill" }]
        : []),
      ...(navigationHistory.length > 0
        ? [{ name: "Back", description: "Return to the previous page", value: "back" }]
        : []),
      ...(screen.getExternalUrl?.(state.focusIndex) || currentSource.type === "url"
        ? [{ name: "Open in browser", description: "Open the selected URL externally", value: "open-external" }]
        : []),
      ...(currentInspectInfo
        ? [{ name: "Inspect", description: "Show fetch and detection details", value: "inspect" }]
        : []),
      ...(currentDoc.kind === "json"
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
        if (opt.value === "copy") void doContextCopy();
        if (opt.value === "copy-all") void doCopyAll();
        if (opt.value === "skill") void doExportSkill();
        if (opt.value === "back") void goBack();
        if (opt.value === "open-external") void doOpenExternal();
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
        ["y", "Copy current item"],
        ["Y", "Copy full content"],
        ["r", "Toggle raw JSON (JSON only)"],
        ["i", "Toggle inspect"],
        ["?", "Toggle this help"],
        ["↑ / ↓", "Navigate list items"],
      ];
      if (navigationHistory.length > 0) {
        bindings.splice(9, 0, ["b", "Back to previous page"]);
      }
      if (screen.getExternalUrl?.(state.focusIndex) || currentSource.type === "url") {
        bindings.splice(10, 0, ["o", "Open in browser"]);
      }
      if (screen.footerKeys.includes("F")) {
        bindings.splice(10, 0, ["F", "Jump to first error"]);
      }
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

    const inspectOverlay = inspectOpen && currentInspectInfo
      ? buildInspectOverlay(currentDoc, currentSource, currentInspectInfo)
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

  async function doContextCopy(): Promise<void> {
    const action = currentScreen?.getContextCopy?.(state.focusIndex);
    if (!action) {
      await doCopyAll();
      return;
    }

    const ok = await copyToClipboard(action.text);
    showStatus(ok ? `Copied ${action.label}` : "Copy failed");
  }

  async function doCopyAll(): Promise<void> {
    const text = renderDocumentForAgent(currentDoc, currentSource, currentInspectInfo);
    const ok = await copyToClipboard(text);
    showStatus(ok ? "Copied full content" : "Copy failed");
  }

  async function doExportSkill(): Promise<void> {
    const canExportSkill = supportsSkillExport(currentDoc);
    if (!canExportSkill) {
      showStatus("Skill export not available");
      return;
    }

    try {
      const result = await exportSkillBundle(currentDoc, currentSource, currentInspectInfo);
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

  async function doOpenExternal(): Promise<void> {
    const target = currentScreen?.getExternalUrl?.(state.focusIndex)
      ?? (currentSource.type === "url" ? currentSource.value : null);
    if (!target) {
      showStatus("No URL to open");
      return;
    }

    const ok = openURL(target);
    showStatus(ok ? "Opened in browser" : "Open failed");
  }

  async function navigateToUrl(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) {
      showStatus("Can only follow http(s) links");
      return;
    }

    const cached = previewCache.get(url);
    if (cached) {
      navigationHistory.push({
        doc: currentDoc,
        source: currentSource,
        inspectInfo: currentInspectInfo,
        truncated: currentTruncated,
      });
      currentDoc = cached.doc;
      currentSource = cached.source;
      currentInspectInfo = cached.inspectInfo;
      currentTruncated = cached.truncated;
      state.focusIndex = 0;
      state.searchOpen = false;
      refreshLayout();
      showStatus("Loaded from cache");
      return;
    }

    showStatus("Loading page…", 2000);
    try {
      const loaded = await loadPreview(
        {
          type: "url",
          value: url,
          label: url,
        },
        options?.forcedMode ?? currentInspectInfo?.forcedMode ?? "auto",
      );
      navigationHistory.push({
        doc: currentDoc,
        source: currentSource,
        inspectInfo: currentInspectInfo,
        truncated: currentTruncated,
      });
      currentDoc = loaded.doc;
      currentSource = loaded.source;
      currentInspectInfo = loaded.inspectInfo;
      currentTruncated = loaded.inspectInfo.truncated;
      previewCache.set(url, {
        doc: loaded.doc,
        source: loaded.source,
        inspectInfo: loaded.inspectInfo,
        truncated: loaded.inspectInfo.truncated,
      });
      state.focusIndex = 0;
      state.searchOpen = false;
      state.searchQuery = "";
      state.searchMatches = [];
      state.searchIndex = 0;
      inspectOpen = false;
      helpOpen = false;
      refreshLayout();
      showStatus("Followed link");
    } catch (error) {
      showStatus(`Navigation failed: ${(error as Error).message}`, 4000);
    }
  }

  function goBack(): void {
    const previous = navigationHistory.pop();
    if (!previous) {
      showStatus("No history");
      return;
    }

    currentDoc = previous.doc;
    currentSource = previous.source;
    currentInspectInfo = previous.inspectInfo;
    currentTruncated = previous.truncated;
    state.focusIndex = 0;
    inspectOpen = false;
    helpOpen = false;
    refreshLayout();
    showStatus("Went back");
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
  renderer.keyInput.on("keypress", (key: KeyPressLike) => {
    if (isEscapeKey(key)) {
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
      if (isPlainKey(key, "?") || isPlainKey(key, "q")) {
        helpOpen = false;
        refreshLayout();
      }
      return;
    }

    if (inspectOpen) {
      clearPendingSkillShortcut();
      if (isPlainKey(key, "i") || isPlainKey(key, "q")) {
        inspectOpen = false;
        refreshLayout();
      }
      return;
    }

    if (state.searchOpen) {
      clearPendingSkillShortcut();
      const searchableContent = getSearchableContent(currentDoc);
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
      if (isPlainKey(key, "k") || isPlainKey(key, "K")) {
        clearPendingSkillShortcut();
        void doExportSkill();
        return;
      }
      clearPendingSkillShortcut();
    }

    if (isPlainKey(key, "q") && !state.paletteOpen) {
      renderer.destroy();
      process.exit(0);
    }

    if (isPlainKey(key, "?") && !state.paletteOpen) {
      helpOpen = true;
      inspectOpen = false;
      refreshLayout();
      return;
    }

    if (isPlainKey(key, "/") && !state.paletteOpen) {
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

    if (isPlainKey(key, "i") && !state.paletteOpen && currentInspectInfo) {
      inspectOpen = !inspectOpen;
      helpOpen = false;
      refreshLayout();
      return;
    }

    if (isPlainKey(key, "b") && !state.paletteOpen && navigationHistory.length > 0) {
      goBack();
      return;
    }

    if (!state.paletteOpen && currentScreen?.handleKey?.(key)) {
      return;
    }

    if (isPlainKey(key, "y") && !state.paletteOpen) {
      void doContextCopy();
      return;
    }

    if (isPlainKey(key, "Y") && !state.paletteOpen) {
      void doCopyAll();
      return;
    }

    if (isPlainKey(key, "o") && !state.paletteOpen) {
      void doOpenExternal();
      return;
    }

    const canExportSkill = supportsSkillExport(currentDoc);
    if (canExportSkill && !state.paletteOpen && (isPlainKey(key, "s") || isPlainKey(key, "S"))) {
      armSkillShortcut();
      return;
    }

    if (isTabKey(key) && !state.paletteOpen && focusables.length > 0) {
      state.focusIndex = (state.focusIndex + 1) % focusables.length;
      focusables[state.focusIndex]?.focus();
      return;
    }

    if (isPlainKey(key, "r") && currentDoc.kind === "json" && !state.paletteOpen) {
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
    ["Status", inspectInfo.statusCode ? String(inspectInfo.statusCode) : inspectInfo.exitCode !== undefined ? `exit ${inspectInfo.exitCode}` : "(none)"],
    ["Duration", inspectInfo.durationMs ? `${inspectInfo.durationMs} ms` : "(unknown)"],
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
  if (inspectInfo.finalUrl && inspectInfo.finalUrl !== source.value) {
    rows.push(["Final URL", inspectInfo.finalUrl]);
  }
  if (typeof inspectInfo.stderrBytes === "number" && inspectInfo.stderrBytes > 0) {
    rows.push(["stderr", formatBytes(inspectInfo.stderrBytes)]);
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
      rows.push(["Classification", doc.classification]);
      rows.push(["Array of objects", doc.isArrayOfObjects ? "yes" : "no"]);
      if (doc.errorSummary) rows.push(["Error", doc.errorSummary]);
      if (doc.pagination) rows.push(["Pagination", formatJsonPagination(doc.pagination)]);
      if (doc.anomalies.length > 0) rows.push(["Anomalies", doc.anomalies.join(", ")]);
      break;
    case "markdown":
      rows.push(["Headings", String(doc.headings.length)]);
      rows.push(["Code blocks", String(doc.codeBlocks.length)]);
      break;
    case "github-pr":
      rows.push(["Files", String(doc.files.length)]);
      rows.push(["Comments", String(doc.comments.length)]);
      break;
    case "table":
      rows.push(["Columns", String(doc.columns.length)]);
      rows.push(["Rows", String(doc.rows.length)]);
      rows.push(["Format", doc.format]);
      break;
    case "log":
      rows.push(["Entries", String(doc.entries.length)]);
      rows.push(["Groups", String(doc.groups.length)]);
      rows.push(["Errors", String(doc.counts.error)]);
      rows.push(["Warnings", String(doc.counts.warn)]);
      rows.push(["Collapsed repeats", String(doc.repeatedGroupCount)]);
      break;
    case "diff":
      rows.push(["Left", `${doc.leftKind} · ${doc.leftLabel}`]);
      rows.push(["Right", `${doc.rightKind} · ${doc.rightLabel}`]);
      rows.push(["Changed", String(doc.stats.changed)]);
      rows.push(["Added", String(doc.stats.added)]);
      rows.push(["Removed", String(doc.stats.removed)]);
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
  } else if (doc.kind === "json") {
    if (doc.errorSummary) {
      notices.push({
        level: "warning",
        message: `Detected JSON error payload. ${doc.errorSummary}`,
      });
    }
    for (const anomaly of doc.anomalies.slice(0, 2)) {
      notices.push({
        level: "info",
        message: anomaly,
      });
    }
  } else if (doc.kind === "log" && doc.repeatedGroupCount > 0) {
    notices.push({
      level: "info",
      message: `Collapsed ${doc.repeatedGroupCount} repeated log groups to keep the triage view readable.`,
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

function formatJsonPagination(pagination: NonNullable<Extract<AnyParsed, { kind: "json" }>["pagination"]>): string {
  return [
    pagination.itemPath ? `items ${pagination.itemPath}` : "",
    pagination.totalPath ? `total ${pagination.totalPath}` : "",
    pagination.nextPath ? `next ${pagination.nextPath}` : "",
    pagination.hasMore !== undefined ? `hasMore ${String(pagination.hasMore)}` : "",
  ].filter(Boolean).join(" · ");
}
