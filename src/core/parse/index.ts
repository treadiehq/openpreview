/**
 * Parse raw content into typed document models.
 * Each parser is isolated; add new parsers here for new content types.
 */

import type { AnyParsed, DetectedContent } from "../models.ts";
import { parseDocs } from "./docs.ts";
import { parseJson } from "./json.ts";
import { parseMarkdown } from "./markdown.ts";
import { parseGitHubPR } from "./github-pr.ts";
import { parseDashboard } from "./dashboard.ts";
import { parseTable } from "./table.ts";
import { parseLog } from "./log.ts";

export async function parse(detected: DetectedContent): Promise<AnyParsed> {
  switch (detected.type) {
    case "html":
      return parseDocs(detected.raw, detected.source);
    case "dashboard":
      return parseDashboard(detected.raw, detected.source);
    case "json":
      return parseJson(detected.raw, detected.source);
    case "markdown":
      return parseMarkdown(detected.raw, detected.source);
    case "github-pr":
      return parseGitHubPR(detected.raw, detected.source);
    case "table":
      return parseTable(detected.raw, detected.source);
    case "log":
      return parseLog(detected.raw, detected.source);
    case "text":
      return {
        kind: "text",
        content: detected.raw,
        source: detected.source,
      };
    default:
      return {
        kind: "text",
        content: detected.raw,
        source: detected.source,
      };
  }
}
