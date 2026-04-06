/**
 * Render screen: display a website screenshot as colored characters.
 *
 * Uses full-block characters (█) with per-row color segments laid out in
 * BoxRenderable rows inside a ScrollBoxRenderable.
 *
 * Each terminal row represents one image row (1:1 mapping) using █ with
 * the pixel's foreground color.
 */

import {
  Box,
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import type { ColorSegment } from "../../core/render.ts";

export function RenderScreenSegments(
  renderer: RenderContext,
  segmentRows: ColorSegment[][],
) {
  const body = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    contentOptions: { flexDirection: "column", gap: 0 },
  });

  for (const row of segmentRows) {
    if (row.length === 1) {
      const seg = row[0]!;
      body.add(
        new TextRenderable(renderer, {
          content: "█".repeat(seg.count),
          fg: seg.fg,
        }),
      );
      continue;
    }

    const rowBox = new BoxRenderable(renderer, {
      flexDirection: "row",
      width: "100%",
    });
    for (const seg of row) {
      rowBox.add(
        new TextRenderable(renderer, {
          content: "█".repeat(seg.count),
          fg: seg.fg,
        }),
      );
    }
    body.add(rowBox);
  }

  return {
    body: Box({ flexGrow: 1 }, body),
    focusables: [] as any[],
    contentScrollBox: body,
  };
}
