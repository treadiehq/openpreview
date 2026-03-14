import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";
import type { InputSource } from "../../core/models.ts";

/** Plain text fallback: show content with minimal formatting. */
export function TextScreen(content: string, _source: InputSource) {
  const lines = content.slice(0, 5000).split("\n").slice(0, 200);
  const body = Box(
    {
      flexDirection: "column",
      flexGrow: 1,
      padding: 2,
      gap: 0,
      overflow: "scroll",
    },
    ...lines.map((line) =>
      Text({
        content: line.slice(0, 200).replace(/\t/g, "  "),
        fg: theme.text,
      })
    )
  );
  return { body, focusables: [] };
}
