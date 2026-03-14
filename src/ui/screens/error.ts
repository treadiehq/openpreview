import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";
import { wrapText } from "../utils/render-content.ts";

export function ErrorScreen(message: string) {
  const lines = message
    .split("\n")
    .flatMap((line) => (line.trim() === "" ? [""] : wrapText(line, 96)));
  return Box(
    {
      flexDirection: "column",
      flexGrow: 1,
      padding: 2,
      gap: 1,
      margin: 2,
    },
    Text({ content: "Error", fg: theme.error }),
    ...lines.map((line) => Text({ content: line, fg: theme.textMuted })),
    Text({ content: "Press q or ESC to quit", fg: theme.textMuted })
  );
}
