import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";
import { Logo, type LogoVariant } from "../components/logo.ts";
import { wrapText } from "../utils/render-content.ts";

const usageLines: [string, string][] = [
  ["preview <url>", "Preview a web page"],
  ["preview <file>", "Preview a local file (.md .json .html)"],
  ["preview --mode docs <url>", "Force docs mode for a page"],
  ["preview --explain <url>", "Print detection and fetch details"],
  ["cat file | preview", "Pipe any content"],
  ["curl <api-url> | preview", "Preview an API response"],
  ["gh pr view 123 | preview", "Preview a GitHub PR"],
];

type WelcomeLayout = {
  logoVariant: LogoVariant;
  cardWidth: number;
  contentWidth: number;
  cardPadding: number;
  stackedRows: boolean;
  bodyGap: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getWelcomeLayout(width: number): WelcomeLayout {
  const availableWidth = Math.max(18, width - 6);
  const cardWidth = Math.min(
    availableWidth,
    width >= 128 ? 92 : width >= 104 ? 84 : availableWidth,
  );
  const cardPadding = width >= 96 ? 2 : 1;
  const contentWidth = Math.max(16, cardWidth - 2 - cardPadding * 2);

  return {
    logoVariant: width >= 84 ? "inline" : "minimal",
    cardWidth,
    contentWidth,
    cardPadding,
    stackedRows: width < 84,
    bodyGap: width >= 96 ? 2 : 1,
  };
}

function renderUsageItem(
  cmd: string,
  desc: string,
  contentWidth: number,
  stackedRows: boolean,
): ReturnType<typeof Box> {
  if (stackedRows) {
    const descWidth = Math.max(12, contentWidth - 2);
    return Box(
      { flexDirection: "column", gap: 0 },
      ...wrapText(cmd, contentWidth).map((line) =>
        Text({ content: line, fg: theme.primary }),
      ),
      Box(
        { flexDirection: "column", paddingLeft: 2 },
        ...wrapText(desc, descWidth).map((line) =>
          Text({ content: line, fg: theme.textMuted }),
        ),
      ),
    );
  }

  const columnGap = contentWidth >= 72 ? 3 : 2;
  const cmdCol = clamp(Math.floor(contentWidth * 0.42), 18, 30);
  const descCol = Math.max(12, contentWidth - cmdCol - columnGap);

  return Box(
    {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: columnGap,
      width: "100%",
    },
    Box(
      { flexDirection: "column", width: cmdCol, flexShrink: 0 },
      ...wrapText(cmd, cmdCol).map((line) =>
        Text({ content: line, fg: theme.primary }),
      ),
    ),
    Box(
      { flexDirection: "column", width: descCol, flexShrink: 1 },
      ...wrapText(desc, descCol).map((line) =>
        Text({ content: line, fg: theme.textMuted }),
      ),
    ),
  );
}

export function WelcomeScreen(terminalWidth: number) {
  const layout = getWelcomeLayout(terminalWidth);
  const subtitleLines = wrapText(
    "Preview anything in your terminal.",
    Math.max(20, layout.cardWidth),
  );

  return Box(
    {
      flexDirection: "column",
      width: "100%",
      height: "100%",
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: layout.bodyGap,
      paddingX: 2,
      paddingY: layout.logoVariant === "minimal" ? 1 : 2,
    },
    Logo({ variant: layout.logoVariant }),
    Box(
      { flexDirection: "column", alignItems: "center", gap: 0 },
      ...subtitleLines.map((line) =>
        Text({ content: line, fg: theme.textMuted }),
      ),
    ),
    Box(
      {
        flexDirection: "column",
        width: layout.cardWidth,
        gap: 0,
        border: true,
        borderStyle: "rounded",
        borderColor: theme.bgMuted,
        backgroundColor: theme.bgMuted,
        padding: layout.cardPadding,
        shouldFill: false,
      },
      Text({ content: "Usage", fg: theme.text }),
      Text({ content: " ", fg: theme.text }),
      ...usageLines.map(([cmd, desc]) =>
        renderUsageItem(cmd, desc, layout.contentWidth, layout.stackedRows),
      ),
    ),
  );
}
