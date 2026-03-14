import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";

export interface HeaderSearchState {
  open: boolean;
  query: string;
  totalMatches: number;
  currentIndex: number;
}

export function Header({
  title,
  subtitle,
  sourceLabel,
  search,
  status,
  modeLabel,
}: {
  title: string;
  subtitle?: string;
  sourceLabel?: string;
  search?: HeaderSearchState;
  status?: string;
  modeLabel?: string;
}) {
  let rightSection: ReturnType<typeof Box> | null = null;

  if (search?.open) {
    const matchLabel =
      search.totalMatches === 0
        ? "No matches"
        : `${search.currentIndex + 1}/${search.totalMatches}`;
    const display = search.query || "Search…";
    const displayColor = search.query ? theme.text : theme.textMuted;
    rightSection = Box(
      { flexDirection: "row", alignItems: "center", gap: 1 },
      Text({ content: "/", fg: theme.primary }),
      Text({ content: display, fg: displayColor }),
      Text({ content: "█", fg: theme.primary }),
      Text({ content: matchLabel, fg: theme.textMuted }),
    );
  } else if (status || modeLabel) {
    const parts: ReturnType<typeof Text>[] = [];
    if (modeLabel) {
      parts.push(Text({ content: modeLabel, fg: theme.primary }));
    }
    if (status) {
      if (parts.length > 0) parts.push(Text({ content: "•", fg: theme.textMuted }));
      parts.push(Text({ content: status, fg: theme.success }));
    }
    rightSection = Box(
      { flexDirection: "row", alignItems: "center", gap: 1 },
      ...parts,
    );
  }

  return Box(
    {
      flexDirection: "column",
      backgroundColor: theme.bg,
      gap: 0,
    },
    Box(
      {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingX: 2,
        paddingY: 1,
        gap: 2,
      },
      Box(
        { flexGrow: 1, flexDirection: "column", gap: 0 },
        Text({
          content: title,
          fg: theme.text,
        }),
        ...(sourceLabel ? [Text({ content: sourceLabel, fg: theme.textMuted })] : []),
        ...(subtitle ? [Text({ content: subtitle, fg: theme.textMuted })] : [])
      ),
      ...(rightSection ? [rightSection] : []),
    ),
    Box(
      { width: "100%", height: 1 },
      Text({ content: "─".repeat(200), fg: theme.borderSubtle }),
    ),
  );
}
