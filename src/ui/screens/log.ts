import {
  Box,
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  Text,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { LogLevel, ParsedLog, ParsedLogEntry } from "../../core/models.ts";
import { wrapText } from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 22;

type LogFilter = "all" | LogLevel;

export function LogScreen(renderer: RenderContext, doc: ParsedLog) {
  const filterOptions = buildFilterOptions(doc);

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options: filterOptions,
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
    const filter = (filterOptions[index]?.value ?? "all") as LogFilter;
    renderLogEntries(renderer, detailBox, doc, filter);
  });

  renderLogEntries(renderer, detailBox, doc, "all");

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

  return { body, focusables: [select], contentScrollBox: detailBox };
}

function renderLogEntries(
  renderer: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedLog,
  filter: LogFilter,
): void {
  detailBox.content.getChildren().forEach((child) => detailBox.content.remove(child.id));

  const contentWidth = Math.max(24, renderer.width - SIDEBAR_WIDTH - 8);
  const visibleEntries = filter === "all"
    ? doc.entries
    : doc.entries.filter((entry) => entry.level === filter);

  detailBox.add(new TextRenderable(renderer, {
    content: formatLogSummary(doc, visibleEntries.length, filter),
    fg: theme.textMuted,
  }));
  detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));

  if (visibleEntries.length === 0) {
    detailBox.add(new TextRenderable(renderer, { content: "No log entries match this filter.", fg: theme.textMuted }));
    detailBox.requestRender();
    return;
  }

  for (const entry of visibleEntries) {
    detailBox.add(renderEntryRow(renderer, entry, contentWidth));
    for (const detail of entry.details) {
      for (const wrapped of wrapText(detail, Math.max(16, contentWidth - 4))) {
        detailBox.add(new TextRenderable(renderer, {
          content: `    ${wrapped}`,
          fg: theme.textMuted,
        }));
      }
    }
    detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));
  }

  detailBox.requestRender();
}

function renderEntryRow(
  renderer: RenderContext,
  entry: ParsedLogEntry,
  contentWidth: number,
): BoxRenderable {
  const row = new BoxRenderable(renderer, { flexDirection: "row" });
  const timestamp = entry.timestamp ? `${entry.timestamp} ` : "";
  const levelLabel = `${formatLevel(entry.level)} `;
  const messageWidth = Math.max(12, contentWidth - timestamp.length - levelLabel.length);
  const message = wrapText(entry.message || "(empty)", messageWidth)[0] ?? "(empty)";

  if (timestamp) {
    row.add(new TextRenderable(renderer, { content: timestamp, fg: theme.textMuted }));
  }
  row.add(new TextRenderable(renderer, { content: levelLabel, fg: levelColor(entry.level) }));
  row.add(new TextRenderable(renderer, { content: message, fg: theme.text }));
  return row;
}

function buildFilterOptions(doc: ParsedLog) {
  const options: Array<{ name: string; description: string; value: LogFilter }> = [
    { name: `All (${doc.entries.length})`, description: "", value: "all" },
  ];

  const orderedLevels: LogLevel[] = ["error", "warn", "info", "debug", "trace", "fatal", "unknown"];
  for (const level of orderedLevels) {
    const count = doc.counts[level] ?? 0;
    if (count > 0) {
      options.push({
        name: `${formatLevel(level)} (${count})`,
        description: "",
        value: level,
      });
    }
  }

  return options;
}

function formatLogSummary(doc: ParsedLog, visibleCount: number, filter: LogFilter): string {
  const parts = [
    `${visibleCount} shown`,
    `${doc.entries.length} total`,
  ];

  for (const level of ["error", "warn", "info", "debug"] as const) {
    const count = doc.counts[level] ?? 0;
    if (count > 0) {
      parts.push(`${formatLevel(level)} ${count}`);
    }
  }

  if (filter !== "all") {
    parts.push(`filter ${formatLevel(filter)}`);
  }

  return parts.join(" · ");
}

function formatLevel(level: LogFilter): string {
  switch (level) {
    case "trace":
      return "TRACE";
    case "debug":
      return "DEBUG";
    case "info":
      return "INFO";
    case "warn":
      return "WARN";
    case "error":
      return "ERROR";
    case "fatal":
      return "FATAL";
    case "unknown":
      return "OTHER";
    default:
      return "ALL";
  }
}

function levelColor(level: LogLevel): string {
  switch (level) {
    case "trace":
    case "debug":
      return theme.textMuted;
    case "info":
      return theme.primary;
    case "warn":
      return theme.warning;
    case "error":
    case "fatal":
      return theme.error;
    default:
      return theme.textMuted;
  }
}
