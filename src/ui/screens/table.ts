import {
  Box,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  Text,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { ParsedTable } from "../../core/models.ts";
import { wrapText } from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 34;

export function TableScreen(renderer: RenderContext, doc: ParsedTable) {
  const rowOptions = doc.rows.length > 0
    ? doc.rows.map((row, index) => ({
        name: formatRowLabel(doc, row, index),
        description: "",
        value: index,
      }))
    : [{ name: "(no rows)", description: "", value: -1 }];

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options: rowOptions,
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

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    renderRowDetail(renderer, detailBox, doc, index);
  });

  renderRowDetail(renderer, detailBox, doc, 0);

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
      Text({ content: "│".repeat(200), fg: theme.borderSubtle }),
    ),
    detailBox,
  );

  return {
    body,
    focusables: [select],
    contentScrollBox: detailBox,
    getContextCopy: () => {
      const selected = select.getSelectedOption?.();
      const index = typeof selected?.value === "number" ? selected.value : -1;
      if (index < 0 || !doc.rows[index]) return null;
      const row = doc.rows[index];
      const pairs = doc.columns.map((column, columnIndex) => `${column}: ${row[columnIndex] ?? ""}`);
      return {
        label: `row ${index + 1}`,
        text: pairs.join("\n"),
      };
    },
  };
}

function renderRowDetail(
  renderer: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedTable,
  index: number,
): void {
  detailBox.content.getChildren().forEach((child) => detailBox.content.remove(child.id));

  if (doc.rows.length === 0 || index < 0 || !doc.rows[index]) {
    detailBox.add(new TextRenderable(renderer, { content: "No rows available", fg: theme.textMuted }));
    detailBox.requestRender();
    return;
  }

  const row = doc.rows[index] ?? [];
  const contentWidth = Math.max(24, renderer.width - SIDEBAR_WIDTH - 8);

  detailBox.add(new TextRenderable(renderer, {
    content: `Row ${index + 1} of ${doc.rows.length}`,
    fg: theme.accent,
  }));
  detailBox.add(new TextRenderable(renderer, {
    content: `${doc.columns.length} columns · ${formatTableFormat(doc.format)}`,
    fg: theme.textMuted,
  }));
  detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));

  const columnOrder = doc.columns.length > 3
    ? [doc.columns.length - 1, ...Array.from({ length: doc.columns.length - 1 }, (_value, i) => i)]
    : Array.from({ length: doc.columns.length }, (_value, i) => i);

  for (const columnIndex of columnOrder) {
    const label = doc.columns[columnIndex] ?? `Column ${columnIndex + 1}`;
    const value = row[columnIndex] ?? "";
    detailBox.add(new TextRenderable(renderer, { content: label, fg: theme.primary }));
    const wrapped = wrapText(value || "(empty)", contentWidth);
    for (const line of wrapped) {
      detailBox.add(new TextRenderable(renderer, { content: `  ${line}`, fg: theme.text }));
    }
    detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));
  }

  detailBox.requestRender();
}

function formatRowLabel(doc: ParsedTable, row: string[], index: number): string {
  const primary = row.slice(0, Math.min(2, row.length)).filter(Boolean).join(" · ");
  const trailing = row.length > 2 ? row[row.length - 1] : "";
  const summary = [primary, trailing].filter(Boolean).join(" — ");
  return `#${index + 1} ${summary || "(empty row)"}`.slice(0, 80);
}

function formatTableFormat(format: ParsedTable["format"]): string {
  switch (format) {
    case "tab":
      return "tab-separated";
    case "csv":
      return "comma-separated";
    case "aligned":
      return "aligned columns";
    default:
      return "fallback table";
  }
}
