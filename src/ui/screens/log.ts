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
import type { LogLevel, ParsedLog, ParsedLogGroup } from "../../core/models.ts";
import type { KeyPressLike } from "../key-events.ts";
import { wrapText } from "../utils/render-content.ts";

const FILTER_WIDTH = 18;
const GROUP_WIDTH = 40;

type LogFilter = "all" | LogLevel;

export function LogScreen(renderer: RenderContext, doc: ParsedLog) {
  const filterOptions = buildFilterOptions(doc);
  let currentFilter: LogFilter = "all";

  const filterSelect = new SelectRenderable(renderer, {
    width: FILTER_WIDTH,
    height: "100%",
    options: filterOptions,
    showDescription: false,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.bgMuted,
    selectedTextColor: theme.accent,
    textColor: theme.textMuted,
  });

  const groupSelect = new SelectRenderable(renderer, {
    width: GROUP_WIDTH,
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

  const refreshGroups = () => {
    const groups = getVisibleGroups(doc, currentFilter);
    groupSelect.options = groups.length > 0
      ? groups.map((group) => ({
          name: formatGroupLabel(group),
          description: "",
          value: group.key,
        }))
      : [{ name: "(no matching entries)", description: "", value: "" }];
    groupSelect.setSelectedIndex(0);
    renderGroupDetail(renderer, detailBox, doc, groups[0], currentFilter);
  };

  filterSelect.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    currentFilter = (filterOptions[index]?.value ?? "all") as LogFilter;
    refreshGroups();
  });

  groupSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    renderGroupDetail(renderer, detailBox, doc, getSelectedGroup(groupSelect, doc, currentFilter), currentFilter);
  });

  refreshGroups();

  const body = Box(
    {
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      gap: 0,
    },
    Box(
      { width: FILTER_WIDTH, flexDirection: "column" },
      filterSelect,
    ),
    Box(
      { width: 1, flexDirection: "column" },
      Text({ content: "│".repeat(200), fg: theme.borderSubtle }),
    ),
    Box(
      { width: GROUP_WIDTH, flexDirection: "column" },
      groupSelect,
    ),
    Box(
      { width: 1, flexDirection: "column" },
      Text({ content: "│".repeat(200), fg: theme.borderSubtle }),
    ),
    detailBox,
  );

  return {
    body,
    focusables: [filterSelect, groupSelect],
    contentScrollBox: detailBox,
    getContextCopy: (focusedIndex: number) => {
      if (focusedIndex === 0) {
        return {
          label: "log filter summary",
          text: formatLogSummary(doc, getVisibleGroups(doc, currentFilter), currentFilter),
        };
      }
      const group = getSelectedGroup(groupSelect, doc, currentFilter);
      if (!group) return null;
      return {
        label: `log group ${group.message.slice(0, 32)}`,
        text: group.raw,
      };
    },
    handleKey: (key: KeyPressLike) => {
      if (key.raw !== "F") return false;
      const firstFailure = findFirstFailureGroup(doc);
      if (!firstFailure) return false;
      const filterIndex = filterOptions.findIndex((option) => option.value === firstFailure.level);
      if (filterIndex >= 0) {
        filterSelect.setSelectedIndex(filterIndex);
      }
      currentFilter = firstFailure.level;
      refreshGroups();
      const groups = getVisibleGroups(doc, currentFilter);
      const groupIndex = groups.findIndex((group) => group.key === firstFailure.key);
      if (groupIndex >= 0) {
        groupSelect.setSelectedIndex(groupIndex);
      }
      return true;
    },
  };
}

function renderGroupDetail(
  renderer: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedLog,
  group: ParsedLogGroup | undefined,
  filter: LogFilter,
): void {
  detailBox.content.getChildren().forEach((child) => detailBox.content.remove(child.id));

  const contentWidth = Math.max(24, renderer.width - FILTER_WIDTH - GROUP_WIDTH - 10);
  const visibleGroups = getVisibleGroups(doc, filter);

  detailBox.add(new TextRenderable(renderer, {
    content: formatLogSummary(doc, visibleGroups, filter),
    fg: theme.textMuted,
  }));

  if (doc.firstFailureIndex >= 0) {
    detailBox.add(new TextRenderable(renderer, {
      content: `First failure at entry ${doc.firstFailureIndex + 1}`,
      fg: theme.warning,
    }));
  }
  if (doc.repeatedGroupCount > 0) {
    detailBox.add(new TextRenderable(renderer, {
      content: `${doc.repeatedGroupCount} repeated groups collapsed`,
      fg: theme.primary,
    }));
  }
  detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));

  if (!group) {
    detailBox.add(new TextRenderable(renderer, {
      content: "No log groups match this filter.",
      fg: theme.textMuted,
    }));
    detailBox.requestRender();
    return;
  }

  detailBox.add(new TextRenderable(renderer, {
    content: `${formatLevel(group.level)} · ${group.count} occurrence${group.count === 1 ? "" : "s"}`,
    fg: levelColor(group.level),
  }));
  addWrapped(detailBox, renderer, group.message, theme.text, contentWidth);
  detailBox.add(new TextRenderable(renderer, { content: " ", fg: theme.text }));

  for (const entry of group.entries.slice(0, 10)) {
    detailBox.add(renderEntryRow(renderer, entry.timestamp, entry.level, entry.message, contentWidth));
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
  timestamp: string | undefined,
  level: LogLevel,
  message: string,
  contentWidth: number,
): BoxRenderable {
  const row = new BoxRenderable(renderer, { flexDirection: "row" });
  const timeLabel = timestamp ? `${timestamp} ` : "";
  const levelLabel = `${formatLevel(level)} `;
  const messageWidth = Math.max(12, contentWidth - timeLabel.length - levelLabel.length);
  const firstLine = wrapText(message || "(empty)", messageWidth)[0] ?? "(empty)";

  if (timeLabel) {
    row.add(new TextRenderable(renderer, { content: timeLabel, fg: theme.textMuted }));
  }
  row.add(new TextRenderable(renderer, { content: levelLabel, fg: levelColor(level) }));
  row.add(new TextRenderable(renderer, { content: firstLine, fg: theme.text }));
  return row;
}

function addWrapped(
  box: ScrollBoxRenderable,
  renderer: RenderContext,
  text: string,
  fg: string,
  width: number,
): void {
  for (const line of wrapText(text, width)) {
    box.add(new TextRenderable(renderer, { content: line, fg }));
  }
}

function getVisibleGroups(doc: ParsedLog, filter: LogFilter): ParsedLogGroup[] {
  return filter === "all"
    ? doc.groups
    : doc.groups.filter((group) => group.level === filter);
}

function getSelectedGroup(
  select: SelectRenderable,
  doc: ParsedLog,
  filter: LogFilter,
): ParsedLogGroup | undefined {
  const selected = select.getSelectedOption?.();
  const key = typeof selected?.value === "string" ? selected.value : "";
  return getVisibleGroups(doc, filter).find((group) => group.key === key);
}

function buildFilterOptions(doc: ParsedLog) {
  const options: Array<{ name: string; description: string; value: LogFilter }> = [
    { name: `All (${doc.groups.length})`, description: "", value: "all" },
  ];

  const orderedLevels: LogLevel[] = ["error", "fatal", "warn", "info", "debug", "trace", "unknown"];
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

function formatLogSummary(doc: ParsedLog, visibleGroups: ParsedLogGroup[], filter: LogFilter): string {
  const parts = [
    `${visibleGroups.length} groups shown`,
    `${doc.entries.length} entries`,
    `ERROR ${doc.counts.error}`,
  ];

  if (doc.counts.warn > 0) parts.push(`WARN ${doc.counts.warn}`);
  if (filter !== "all") parts.push(`filter ${formatLevel(filter)}`);
  return parts.join(" · ");
}

function formatGroupLabel(group: ParsedLogGroup): string {
  return `${formatLevel(group.level)} x${group.count} ${group.message}`.slice(0, 120);
}

function findFirstFailureGroup(doc: ParsedLog): ParsedLogGroup | undefined {
  return doc.groups.find((group) => group.level === "error" || group.level === "fatal");
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
