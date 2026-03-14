import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function LoadingScreen(frame = 0) {
  const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  return Box(
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 1,
    },
    Text({ content: `${spinner} Loading…`, fg: theme.accent }),
    Text({ content: "Fetching and parsing content…", fg: theme.textMuted })
  );
}

export const SPINNER_FRAME_COUNT = SPINNER_FRAMES.length;
