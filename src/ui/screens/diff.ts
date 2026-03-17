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
import type { ParsedDiff } from "../../core/models.ts";
import { wrapText } from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 42;

export function DiffScreen(renderer: RenderContext, doc: ParsedDiff) {
  const options = doc.entries.map((entry) => ({
    name: `${statusGlyph(entry.status)} ${entry.title}`,
    description: "",
    value: entry.id,
  }));

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options: options.length > 0 ? options : [{ name: "(no differences)", description: "", value: "" }],
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

  const renderEntry = (entryId?: string) => {
    detailBox.content.getChildren().forEach((child) => detailBox.content.remove(child.id));
    const entry = doc.entries.find((item) => item.id === entryId) ?? doc.entries[0];
    const contentWidth = Math.max(24, renderer.width - SIDEBAR_WIDTH - 8);

    detailBox.add(new TextRenderable(renderer, {
      content: doc.summary,
      fg: theme.textMuted,
    }));
    detailBox.add(new TextRenderable(renderer, {
      content: `${doc.leftLabel} → ${doc.rightLabel}`,
      fg: theme.primary,
    }));
    detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));

    if (!entry) {
      detailBox.add(new TextRenderable(renderer, {
        content: "No differences detected.",
        fg: theme.textMuted,
      }));
      detailBox.requestRender();
      return;
    }

    detailBox.add(new TextRenderable(renderer, {
      content: `${statusLabel(entry.status)} · ${entry.title}`,
      fg: statusColor(entry.status),
    }));
    if (entry.detail) {
      for (const line of wrapText(entry.detail, contentWidth)) {
        detailBox.add(new TextRenderable(renderer, { content: line, fg: theme.textMuted }));
      }
    }
    if (entry.before !== undefined) {
      detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));
      detailBox.add(new TextRenderable(renderer, { content: "Before", fg: theme.warning }));
      for (const line of splitPreview(entry.before, contentWidth)) {
        detailBox.add(new TextRenderable(renderer, { content: line, fg: theme.text }));
      }
    }
    if (entry.after !== undefined) {
      detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));
      detailBox.add(new TextRenderable(renderer, { content: "After", fg: theme.success }));
      for (const line of splitPreview(entry.after, contentWidth)) {
        detailBox.add(new TextRenderable(renderer, { content: line, fg: theme.text }));
      }
    }
    detailBox.requestRender();
  };

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (_index: number, option?: { value?: string }) => {
    renderEntry(typeof option?.value === "string" ? option.value : undefined);
  });

  renderEntry(doc.entries[0]?.id);

  const body = Box(
    {
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      gap: 0,
    },
    Box({ width: SIDEBAR_WIDTH, flexDirection: "column" }, select),
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
      const entry = doc.entries.find((item) => item.id === selected?.value) ?? doc.entries[0];
      if (!entry) return null;
      return {
        label: `diff ${entry.title}`,
        text: [
          `${statusLabel(entry.status)} ${entry.title}`,
          entry.detail ?? "",
          entry.before !== undefined ? `Before:\n${entry.before}` : "",
          entry.after !== undefined ? `After:\n${entry.after}` : "",
        ].filter(Boolean).join("\n\n"),
      };
    },
  };
}

function splitPreview(value: string, width: number): string[] {
  return value
    .split("\n")
    .slice(0, 80)
    .flatMap((line) => wrapText(line, width));
}

function statusGlyph(status: ParsedDiff["entries"][number]["status"]): string {
  switch (status) {
    case "added":
      return "+";
    case "removed":
      return "-";
    case "changed":
      return "~";
    default:
      return "=";
  }
}

function statusLabel(status: ParsedDiff["entries"][number]["status"]): string {
  switch (status) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "changed":
      return "Changed";
    default:
      return "Unchanged";
  }
}

function statusColor(status: ParsedDiff["entries"][number]["status"]): string {
  switch (status) {
    case "added":
      return theme.success;
    case "removed":
      return theme.error;
    case "changed":
      return theme.warning;
    default:
      return theme.textMuted;
  }
}
