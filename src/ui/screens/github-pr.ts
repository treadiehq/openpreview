import {
  Box,
  Text,
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { ParsedGitHubPR } from "../../core/models.ts";
import { wrapText } from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 24;

const TAB_OVERVIEW = 0;
const TAB_FILES = 1;
const TAB_COMMENTS = 2;

function addWrapped(ctx: RenderContext, box: ScrollBoxRenderable, text: string, fg: string) {
  const contentWidth = getContentWidth(ctx);
  for (const line of wrapText(text, contentWidth)) {
    box.add(new TextRenderable(ctx, { content: line || " ", fg }));
  }
}

function updateDetailBox(
  ctx: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedGitHubPR,
  tabIndex: number
): void {
  detailBox.content.getChildren().forEach((c) => detailBox.content.remove(c.id));

  if (tabIndex === TAB_OVERVIEW) {
    addWrapped(ctx, detailBox, doc.title, theme.accent);
    if (doc.author) detailBox.add(new TextRenderable(ctx, { content: `Author: ${doc.author}`, fg: theme.textMuted }));
    if (doc.status) detailBox.add(new TextRenderable(ctx, { content: `Status: ${doc.status}`, fg: theme.textMuted }));
    detailBox.add(new TextRenderable(ctx, { content: "─".repeat(40), fg: theme.borderSubtle }));
    detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
    for (const line of doc.body.slice(0, 3000).split("\n").slice(0, 80)) {
      if (line.trim() === "") {
        detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
      } else {
        addWrapped(ctx, detailBox, line, theme.text);
      }
    }
  } else if (tabIndex === TAB_FILES) {
    detailBox.add(new TextRenderable(ctx, { content: "Changed files", fg: theme.textMuted }));
    detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
    for (const f of doc.files.slice(0, 50)) {
      const status = f.status ?? "?";
      const statusColor = status === "A" ? theme.success : status === "D" ? theme.error : theme.warning;
      const row = new BoxRenderable(ctx, { flexDirection: "row", gap: 1 });
      row.add(new TextRenderable(ctx, { content: status, fg: statusColor }));
      row.add(new TextRenderable(ctx, { content: f.path, fg: theme.text }));
      detailBox.add(row);
    }
  } else {
    detailBox.add(new TextRenderable(ctx, { content: "Comments", fg: theme.textMuted }));
    detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
    if (doc.comments.length === 0) {
      detailBox.add(new TextRenderable(ctx, { content: "No comments", fg: theme.textMuted }));
    }
    for (const c of doc.comments.slice(0, 20)) {
      if (c.author) {
        detailBox.add(new TextRenderable(ctx, { content: `@${c.author}`, fg: theme.primary }));
      }
      addWrapped(ctx, detailBox, c.body, theme.text);
      detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
    }
  }
  detailBox.requestRender();
}

export function GitHubPRScreen(
  renderer: RenderContext,
  doc: ParsedGitHubPR
) {
  const tabOptions = [
    { name: "Overview", description: "", value: TAB_OVERVIEW },
    { name: "Files", description: "", value: TAB_FILES },
    { name: "Comments", description: "", value: TAB_COMMENTS },
  ];

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options: tabOptions,
    showDescription: false,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.bgMuted,
    selectedTextColor: theme.accent,
    textColor: theme.textMuted,
  });

  const detailBox = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    padding: 2,
    contentOptions: { flexDirection: "column" },
  });

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    updateDetailBox(renderer, detailBox, doc, index);
  });

  updateDetailBox(renderer, detailBox, doc, 0);

  const sidebar = Box(
    {
      width: SIDEBAR_WIDTH,
      flexDirection: "column",
    },
    select
  );

  const body = Box(
    {
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      gap: 0,
    },
    sidebar,
    Box(
      { width: 1, flexDirection: "column" },
      Text({ content: "│".repeat(200), fg: theme.borderSubtle })
    ),
    detailBox
  );

  return { body, focusables: [select], contentScrollBox: detailBox };
}

function getContentWidth(ctx: RenderContext): number {
  return Math.max(20, ctx.width - SIDEBAR_WIDTH - 7);
}
