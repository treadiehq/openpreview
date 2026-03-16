/**
 * Screen router: given renderer, doc, and options, return { body, focusables, footerKeys }.
 */

import type { AnyParsed } from "../../core/models.ts";
import type { createCliRenderer } from "@opentui/core";
import type { ShortcutKey } from "../components/footer.ts";
import { DocsScreen } from "./docs.ts";
import { JsonScreen } from "./json.ts";
import { MarkdownScreen } from "./markdown.ts";
import { TextScreen } from "./text.ts";
import { GitHubPRScreen } from "./github-pr.ts";
import { DashboardScreen } from "./dashboard.ts";
import { TableScreen } from "./table.ts";
import { LogScreen } from "./log.ts";

export interface ScreenOptions {
  jsonViewMode?: "structured" | "raw";
  focusIndex?: number;
  searchScrollLine?: number;
}

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;

type SelectComponent = {
  focus: () => void;
  on: (ev: string, fn: (...args: any[]) => void) => void;
};

export interface ScreenResult {
  body: ReturnType<typeof import("@opentui/core").Box>;
  focusables: SelectComponent[];
  footerKeys: ShortcutKey[];
  contentScrollBox?: { scrollTo(position: number): void };
}

const BASE_KEYS: ShortcutKey[] = ["q", "/", "y", "?"];

export function getScreen(
  renderer: Renderer,
  doc: AnyParsed,
  options?: ScreenOptions
): ScreenResult {
  const opts = options ?? {};
  switch (doc.kind) {
    case "docs": {
      const s = DocsScreen(renderer, doc);
      return { ...s, footerKeys: [...BASE_KEYS, "Tab", "Enter"] };
    }
    case "json": {
      const s = JsonScreen(renderer, doc, opts);
      return { ...s, footerKeys: [...BASE_KEYS, "Tab", "r"] };
    }
    case "markdown": {
      const s = MarkdownScreen(renderer, doc);
      return { ...s, footerKeys: [...BASE_KEYS, "Tab"] };
    }
    case "github-pr": {
      const s = GitHubPRScreen(renderer, doc);
      return { ...s, footerKeys: [...BASE_KEYS, "Enter"] };
    }
    case "dashboard": {
      const s = DashboardScreen(renderer, doc);
      return { ...s, footerKeys: [...BASE_KEYS, "Tab"] };
    }
    case "table": {
      const s = TableScreen(renderer, doc);
      return { ...s, footerKeys: [...BASE_KEYS] };
    }
    case "log": {
      const s = LogScreen(renderer, doc);
      return { ...s, footerKeys: [...BASE_KEYS] };
    }
    default: {
      const s = TextScreen(renderer, doc.content, doc.source);
      return { ...s, footerKeys: [...BASE_KEYS] };
    }
  }
}
