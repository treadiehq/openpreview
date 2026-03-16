import {
  Box,
  ScrollBoxRenderable,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { InputSource } from "../../core/models.ts";
import { wrapText } from "../utils/render-content.ts";

/** Plain text fallback: preserve the full text and wrap it to the current pane width. */
export function TextScreen(renderer: RenderContext, content: string, _source: InputSource) {
  const body = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    padding: 2,
    contentOptions: { flexDirection: "column", gap: 0 },
  });

  const contentWidth = Math.max(24, renderer.width - 6);
  const lines = content.replace(/\r\n?/g, "\n").split("\n");

  for (const line of lines) {
    const normalized = line.replace(/\t/g, "  ");
    const wrapped = normalized.length > 0 ? wrapText(normalized, contentWidth) : [" "];
    for (const chunk of wrapped) {
      body.add(new TextRenderable(renderer, { content: chunk || " ", fg: theme.text }));
    }
  }

  return { body: Box({ flexGrow: 1 }, body), focusables: [], contentScrollBox: body };
}
