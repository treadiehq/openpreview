import { Box, Text } from "@opentui/core";
import { VERSION } from "../../core/version.ts";
import { theme } from "../theme.ts";

export type ShortcutKey =
  | "q"
  | "/"
  | "Tab"
  | "Enter"
  | "y"
  | "Y"
  | "b"
  | "o"
  | "F"
  | "r"
  | "?"
  | "i"
  | "SK";

const ALL_SHORTCUTS: [ShortcutKey, string][] = [
  ["q", "quit"],
  ["/", "search"],
  ["Tab", "panes"],
  ["Enter", "open"],
  ["y", "copy"],
  ["Y", "copy all"],
  ["b", "back"],
  ["o", "browser"],
  ["F", "first err"],
  ["r", "raw"],
  ["i", "inspect"],
  ["SK", "skill"],
  ["?", "help"],
];

export function Footer(opts?: {
  variant?: "shortcuts" | "status" | "welcome";
  version?: string;
  keys?: ShortcutKey[];
}) {
  const variant = opts?.variant ?? "shortcuts";
  if (variant === "welcome") {
    const version = opts?.version ?? VERSION;
    return Box(
      {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingX: 2,
        paddingY: 1,
        backgroundColor: theme.bg,
      },
      Box(
        { flexDirection: "row", gap: 1 },
        Text({ content: "q", fg: theme.primary }),
        Text({ content: "quit", fg: theme.textMuted }),
      ),
      Text({ content: version, fg: theme.textMuted })
    );
  }
  if (variant === "status") {
    const cwd = process.cwd().replace(process.env.HOME ?? "", "~");
    const version = opts?.version ?? VERSION;
    return Box(
      {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingX: 2,
        paddingY: 1,
        backgroundColor: theme.bg,
      },
      Text({ content: cwd, fg: theme.textMuted }),
      Text({ content: version, fg: theme.textMuted })
    );
  }

  const allowed = opts?.keys;
  const shortcuts = allowed
    ? ALL_SHORTCUTS.filter(([k]) => allowed.includes(k))
    : ALL_SHORTCUTS;

  return Box(
    {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingX: 2,
      paddingTop: 1,
      paddingBottom: 2,
      backgroundColor: theme.bg,
      gap: 3,
    },
    ...shortcuts.flatMap(([key, label]) => [
      Text({ content: key, fg: theme.primary }),
      Text({ content: label, fg: theme.textMuted }),
    ])
  );
}
