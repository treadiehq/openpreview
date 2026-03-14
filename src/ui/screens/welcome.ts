import { Box, Text } from "@opentui/core";
import { theme } from "../theme.ts";
import { Logo } from "../components/logo.ts";

export function WelcomeScreen() {
  const usageLines: [string, string][] = [
    ["preview <url>",              "Preview a web page"],
    ["preview <file>",             "Preview a local file (.md .json .html)"],
    ["preview --mode docs <url>",  "Force docs mode for a page"],
    ["preview update",             "Update an installed release binary"],
    ["preview --explain <url>",    "Print detection and fetch details"],
    ["cat file | preview",         "Pipe any content"],
    ["curl <api-url> | preview",   "Preview an API response"],
    ["gh pr view 123 | preview",   "Preview a GitHub PR"],
  ];

  // const modeLines: [string, string][] = [
  //   ["Docs",       "HTML pages → sections, links, code blocks"],
  //   ["API",        "JSON → schema, list/detail, raw toggle"],
  //   ["Markdown",   "TOC sidebar, rich rendering, code blocks"],
  //   ["GitHub PR",  "Overview, files, comments tabs"],
  //   ["Dashboard",  "Metrics, panels, stats summary"],
  // ];

  const cmdCol = 30;

  return Box(
    {
      flexDirection: "column",
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingY: 2,
    },
    Logo(),
    Text({ content: "Preview anything, right in your terminal.", fg: theme.textMuted }),
    Box(
      {
        flexDirection: "column",
        gap: 0,
        border: true,
        borderStyle: "rounded",
        borderColor: theme.bgMuted,
        shouldFill: false,
      },
      Box(
        {
          flexDirection: "column",
          gap: 0,
          padding: 2,
          backgroundColor: theme.bgMuted,
        },
        Box(
          {
            paddingX: 2,
            flexDirection: "column",
            gap: 1,
          },
          Text({ content: "Usage", fg: theme.text }),
          ...usageLines.map(([cmd, desc]) =>
            Box(
              { flexDirection: "row" },
              Text({ content: cmd.padEnd(cmdCol), fg: theme.primary }),
              Text({ content: desc, fg: theme.textMuted }),
            )
          ),
        ),
      ),
    ),
  );
}
