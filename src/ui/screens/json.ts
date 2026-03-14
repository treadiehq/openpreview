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
import type { ParsedJson } from "../../core/models.ts";
import type { ScreenOptions } from "./index.ts";

const SIDEBAR_WIDTH = 36;
const MAX_RAW_LINES = 150;

function updateDetailBox(
  ctx: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedJson,
  index: number
): void {
  const isTable = doc.isArrayOfObjects && doc.rows && doc.rows.length > 0;
  const selectedRow = isTable && doc.rows ? doc.rows[index] : doc.root;
  const detailText =
    selectedRow !== undefined
      ? JSON.stringify(selectedRow, null, 2).split("\n").slice(0, MAX_RAW_LINES).join("\n")
      : doc.schemaSummary;
  const lines = detailText.split("\n");
  detailBox.content.getChildren().forEach((c) => detailBox.content.remove(c.id));
  detailBox.add(new TextRenderable(ctx, { content: "Detail", fg: theme.textMuted }));
  for (const line of lines) {
    detailBox.add(new TextRenderable(ctx, { content: line.slice(0, 120), fg: theme.text }));
  }
  detailBox.requestRender();
}

export function JsonScreen(
  renderer: RenderContext,
  doc: ParsedJson,
  options?: ScreenOptions
) {
  if (options?.jsonViewMode === "raw") {
    const rawText = JSON.stringify(doc.root, null, 2);
    const lines = rawText.split("\n").slice(0, 200);
    const body = Box(
      {
        flexGrow: 1,
        flexDirection: "column",
        padding: 2,
        gap: 0,
        overflow: "scroll",
      },
      Text({ content: "Raw JSON", fg: theme.textMuted }),
      ...lines.map((l) => Text({ content: l.slice(0, 120), fg: theme.text }))
    );
    return { body, focusables: [] };
  }

  const rows = doc.rows ?? [];
  const isTable = doc.isArrayOfObjects && rows.length > 0;
  const keys = isTable && rows[0]
    ? Object.keys(rows[0])
    : doc.node && typeof doc.node === "object" && "keys" in doc.node
      ? (doc.node as { keys: string[] }).keys
      : [];

  const rowOptions = isTable
    ? rows.slice(0, 200).map((row, i) => {
        const preview = keys
          .slice(0, 2)
          .map((k) => String((row as Record<string, unknown>)[k] ?? "").slice(0, 15))
          .join(" · ");
        return { name: `#${i + 1} ${preview}`, description: "", value: i };
      })
    : [{ name: doc.schemaSummary, description: "", value: 0 }];

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
