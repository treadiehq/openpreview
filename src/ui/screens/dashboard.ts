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
import type { ParsedDashboard } from "../../core/models.ts";
import { wrapText } from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 28;

function updateDetailBox(
  ctx: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedDashboard,
  panelIndex: number
): void {
  detailBox.content.getChildren().forEach((c) => detailBox.content.remove(c.id));

  const panel = doc.panels[panelIndex];
  if (!panel) {
    detailBox.add(new TextRenderable(ctx, { content: "No panel selected", fg: theme.textMuted }));
    detailBox.requestRender();
    return;
  }

  const contentWidth = getContentWidth(ctx);

  if (doc.metrics.length > 0) {
    const metricsLine = `Metrics: ${doc.metrics.slice(0, 12).join(" · ")}`;
    for (const l of wrapText(metricsLine, contentWidth)) {
      detailBox.add(new TextRenderable(ctx, { content: l, fg: theme.accent }));
    }
  }
  detailBox.add(new TextRenderable(ctx, { content: "─".repeat(40), fg: theme.borderSubtle }));
  detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));
  if (panel.title) detailBox.add(new TextRenderable(ctx, { content: panel.title, fg: theme.text }));
  for (const v of panel.values.slice(0, 20)) {
    for (const l of wrapText(String(v), contentWidth)) {
      detailBox.add(new TextRenderable(ctx, { content: l || " ", fg: theme.text }));
    }
  }
  for (const link of panel.links?.slice(0, 5) ?? []) {
    for (const l of wrapText(link, contentWidth)) {
      detailBox.add(new TextRenderable(ctx, { content: l, fg: theme.accent }));
    }
  }
  detailBox.requestRender();
}

export function DashboardScreen(
  renderer: RenderContext,
  doc: ParsedDashboard
) {
  const panelOptions = doc.panels.map((p, i) => ({
    name: p.title || `Panel ${i + 1}`,
    description: "",
    value: i,
  }));

  const options = panelOptions.length ? panelOptions : [{ name: "(no panels)", description: "", value: 0 }];

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options,
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
