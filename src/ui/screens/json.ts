import {
  Box,
  Text,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { JsonEntrySummary, ParsedJson } from "../../core/models.ts";
import type { ScreenOptions } from "./index.ts";
import type { KeyPressLike } from "../key-events.ts";
import { wrapText } from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 38;
const MAX_RAW_LINES = 220;

type JsonViewState = {
  path: string;
  value: unknown;
};

export function JsonScreen(
  renderer: RenderContext,
  doc: ParsedJson,
  options?: ScreenOptions
) {
  if (options?.jsonViewMode === "raw") {
    const rawText = JSON.stringify(doc.root, null, 2);
    const lines = rawText.split("\n").slice(0, MAX_RAW_LINES);
    const body = Box(
      {
        flexGrow: 1,
        flexDirection: "column",
        padding: 2,
        gap: 0,
        overflow: "scroll",
      },
      Text({ content: "Raw JSON", fg: theme.textMuted }),
      ...lines.map((line) => Text({ content: line.slice(0, 160), fg: theme.text }))
    );
    return { body, focusables: [] };
  }

  let current: JsonViewState = { path: "$", value: doc.root };
  const history: JsonViewState[] = [];

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options: [],
    showDescription: false,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.bgMuted,
    selectedTextColor: theme.accent,
    textColor: theme.textMuted,
  });

  const detailBox = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    padding: 2,
    contentOptions: { flexDirection: "column", gap: 0 },
  });

  const refresh = () => {
    const entries = getEntriesForValue(current.value, current.path);
    select.options = entries.length > 0
      ? entries.map((entry) => ({
          name: formatEntryLabel(entry),
          description: "",
          value: entry.path,
        }))
      : [{ name: "(no nested fields)", description: "", value: "" }];
    select.setSelectedIndex(0);
    renderDetailBox(renderer, detailBox, doc, current, entries[0]);
  };

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number) => {
    const entry = getSelectedEntry(select, current);
    renderDetailBox(renderer, detailBox, doc, current, entry);
  });

  select.on(SelectRenderableEvents.ITEM_SELECTED, () => {
    const entry = getSelectedEntry(select, current);
    if (!entry || !isExpandable(entry.value)) return;
    history.push(current);
    current = {
      path: entry.path,
      value: entry.value,
    };
    refresh();
  });

  refresh();

  const body = Box(
    {
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      gap: 0,
    },
    Box(
      { width: SIDEBAR_WIDTH, flexDirection: "column" },
      select,
    ),
    Box(
      { width: 1, flexDirection: "column" },
      Text({ content: "│".repeat(200), fg: theme.borderSubtle })
    ),
    detailBox
  );

  return {
    body,
    focusables: [select],
    contentScrollBox: detailBox,
    getContextCopy: () => {
      const entry = getSelectedEntry(select, current);
      const path = entry?.path ?? current.path;
      const value = entry?.value ?? current.value;
      return {
        label: `JSON ${path}`,
        text: `${path}\n${JSON.stringify(value, null, 2)}`,
      };
    },
    handleKey: (key: KeyPressLike) => {
      if (key.raw === "b" && history.length > 0) {
        current = history.pop() as JsonViewState;
        refresh();
        return true;
      }
      return false;
    },
  };
}

function renderDetailBox(
  ctx: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedJson,
  current: JsonViewState,
  selected?: JsonEntrySummary,
): void {
  detailBox.content.getChildren().forEach((child) => detailBox.content.remove(child.id));

  const selectedPath = selected?.path ?? current.path;
  const selectedValue = selected?.value ?? current.value;
  const contentWidth = Math.max(24, ctx.width - SIDEBAR_WIDTH - 8);

  detailBox.add(new TextRenderable(ctx, {
    content: selectedPath === "$" ? "JSON overview" : selectedPath,
    fg: theme.accent,
  }));

  if (current.path === "$") {
    detailBox.add(new TextRenderable(ctx, {
      content: `${doc.classification} · ${doc.schemaSummary}`,
      fg: theme.textMuted,
    }));
    if (doc.errorSummary) {
      addWrapped(detailBox, ctx, `Error: ${doc.errorSummary}`, theme.error, contentWidth);
    }
    if (doc.pagination) {
      const summary = [
        doc.pagination.itemPath ? `items ${doc.pagination.itemPath}` : "",
        doc.pagination.totalPath ? `total ${doc.pagination.totalPath}` : "",
        doc.pagination.nextPath ? `next ${doc.pagination.nextPath}` : "",
        doc.pagination.hasMore !== undefined ? `hasMore ${String(doc.pagination.hasMore)}` : "",
      ].filter(Boolean).join(" · ");
      if (summary) {
        addWrapped(detailBox, ctx, `Pagination: ${summary}`, theme.primary, contentWidth);
      }
    }
    for (const anomaly of doc.anomalies.slice(0, 4)) {
      addWrapped(detailBox, ctx, `Anomaly: ${anomaly}`, theme.warning, contentWidth);
    }
  }

  detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
  const jsonText = JSON.stringify(selectedValue, null, 2) ?? String(selectedValue);
  for (const line of jsonText.split("\n").slice(0, MAX_RAW_LINES)) {
    for (const wrapped of wrapText(line, contentWidth)) {
      detailBox.add(new TextRenderable(ctx, {
        content: wrapped,
        fg: theme.text,
      }));
    }
  }
  detailBox.requestRender();
}

function addWrapped(
  box: ScrollBoxRenderable,
  ctx: RenderContext,
  text: string,
  fg: string,
  width: number,
): void {
  for (const line of wrapText(text, width)) {
    box.add(new TextRenderable(ctx, { content: line, fg }));
  }
}

function getEntriesForValue(value: unknown, basePath: string): JsonEntrySummary[] {
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item, index) => ({
      path: `${basePath}[${index}]`,
      label: `#${index + 1}`,
      type: getValueType(item),
      preview: summarizeValue(item),
      value: item,
    }));
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
      path: basePath === "$" ? key : `${basePath}.${key}`,
      label: key,
      type: getValueType(item),
      preview: summarizeValue(item),
      value: item,
    }));
  }

  return [];
}

function getSelectedEntry(select: SelectRenderable, current: JsonViewState): JsonEntrySummary | undefined {
  const selected = select.getSelectedOption?.();
  const path = typeof selected?.value === "string" ? selected.value : "";
  return getEntriesForValue(current.value, current.path).find((entry) => entry.path === path);
}

function formatEntryLabel(entry: JsonEntrySummary): string {
  return `${entry.label} · ${entry.type} · ${entry.preview}`.slice(0, 120);
}

function isExpandable(value: unknown): boolean {
  return Array.isArray(value) || (value !== null && typeof value === "object");
}

function getValueType(value: unknown): JsonEntrySummary["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value as JsonEntrySummary["type"];
}

function summarizeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") {
    return `{ ${Object.keys(value as object).slice(0, 6).join(", ")} }`;
  }
  return String(value).replace(/\s+/g, " ").slice(0, 80);
}
