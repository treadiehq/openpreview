import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";

/*
 * Block-art logo using OpenCode's exact rendering system.
 * Shadow markers: _ = shadow space, ^ = ▀ in letter color, ~ = ▀ in shadow color.
 * Left ("open") from OpenCode's logo.ts, right ("preview") in matching style.
 */

const LEFT = [
  "█▀▀█ █▀▀█ █▀▀█ █▀▀▄",
  "█__█ █__█ █^^^ █__█",
  "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀",
];

const RIGHT = [
  "█▀▀█ █▀▀█ █▀▀█ █__█ ▀██▀ █▀▀█ █___█",
  "█__█ █▀▀▀ █^^^ ▀▄▄▀ _██_ █^^^ █_▄_█",
  "█▀▀▀ █__█ ▀▀▀▀ _▀▀_ ▄██▄ ▀▀▀▀ ▀▀~▀▀",
];

function tint(bg: string, fg: string): string {
  const p = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const b = p(bg),
    f = p(fg);
  return (
    "#" +
    [0, 1, 2]
      .map((i) =>
        Math.round(b[i] + 0.25 * (f[i] - b[i]))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function renderLine(
  line: string,
  fg: string,
  shadowFg: string,
): ReturnType<typeof Text>[] {
  const visual = line.replace(/_/g, " ").replace(/\^/g, "▀");
  const parts = visual.split("~");
  const out: ReturnType<typeof Text>[] = [];
  parts.forEach((part, i) => {
    if (part) out.push(Text({ content: part, fg }));
    if (i < parts.length - 1) out.push(Text({ content: "▀", fg: shadowFg }));
  });
  return out;
}

function renderWord(
  lines: string[],
  fg: string,
  shadowFg: string,
): ReturnType<typeof Box>[] {
  return lines.map((line) =>
    Box(
      { flexDirection: "row" },
      ...renderLine(line, fg, shadowFg),
    ),
  );
}

export type LogoVariant = "inline" | "stacked" | "minimal";

export function Logo(opts?: { variant?: LogoVariant }) {
  const variant = opts?.variant ?? "inline";
  const ls = tint(theme.bg, theme.textMuted);
  const rs = tint(theme.bg, theme.text);

  if (variant === "minimal") {
    return Box(
      { flexDirection: "row", alignItems: "center", gap: 0 },
      Text({ content: "open", fg: theme.textMuted }),
      Text({ content: "preview", fg: theme.text }),
    );
  }

  if (variant === "stacked") {
    return Box(
      { flexDirection: "column", alignItems: "center", gap: 0 },
      ...renderWord(LEFT, theme.textMuted, ls),
      ...renderWord(RIGHT, theme.text, rs),
    );
  }

  return Box(
    { flexDirection: "column", alignItems: "center", gap: 0 },
    ...LEFT.map((line, i) =>
      Box(
        { flexDirection: "row" },
        ...renderLine(line, theme.textMuted, ls),
        Text({ content: " " }),
        ...renderLine(RIGHT[i], theme.text, rs),
      ),
    ),
  );
}
