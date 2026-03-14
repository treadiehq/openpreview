import {
  Box,
  Text,
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  type RenderContext,
} from "@opentui/core";
import { theme } from "../theme.ts";
import type { ParsedMarkdown } from "../../core/models.ts";
import {
  highlightCode,
  parseInlineMarkdown,
  type StyledLine,
} from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 30;

interface Section {
  id: string;
  title: string;
  lines: StyledLine[];
}

function buildSections(raw: string): Section[] {
  const allLines = raw.split("\n");
  const sections: Section[] = [];
  let current: Section = { id: "__top", title: "Top", lines: [] };
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  function flushCode() {
    if (codeBuffer.length === 0) return;
    current.lines.push([{ text: `  ┌ ${codeLang || "code"}`, fg: theme.textMuted }]);
    for (const highlighted of highlightCode(codeBuffer.join("\n"))) {
      current.lines.push([{ text: "  │ ", fg: theme.borderSubtle }, ...highlighted]);
    }
    current.lines.push([{ text: "  └", fg: theme.textMuted }]);
    codeBuffer = [];
    codeLang = "";
  }

  for (const line of allLines) {
    if (/^```/.test(line)) {
      if (inCodeBlock) { flushCode(); inCodeBlock = false; }
      else { inCodeBlock = true; codeLang = line.replace(/^```\s*/, "").trim(); }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      flushCode();
      if (current.lines.length > 0 || current.id !== "__top") sections.push(current);
      const text = hm[2].trim();
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const level = hm[1].length;
      const prefix = level === 1 ? "# " : level === 2 ? "## " : "### ";
      current = { id, title: text, lines: [] };
      current.lines.push([{ text: " ", fg: theme.text }]);
      current.lines.push([
        { text: prefix, fg: theme.textMuted },
        { text: text, fg: theme.accent },
      ]);
      current.lines.push([{ text: " ", fg: theme.text }]);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      current.lines.push([{ text: "─".repeat(40), fg: theme.borderSubtle }]);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const content = line.replace(/^>\s?/, "");
      current.lines.push([{ text: "  │ ", fg: theme.primary }, ...parseInlineMarkdown(content)]);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      const content = line.replace(/^[-*]\s/, "");
      current.lines.push([{ text: "  • ", fg: theme.textMuted }, ...parseInlineMarkdown(content)]);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const nm = line.match(/^(\d+)\.\s(.*)/);
      if (nm) {
        current.lines.push([{ text: `  ${nm[1]}. `, fg: theme.textMuted }, ...parseInlineMarkdown(nm[2])]);
        continue;
      }
    }
    if (/^\|/.test(line)) {
      if (/^\|[\s-:|]+\|$/.test(line)) continue;
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      current.lines.push([
        { text: "  ", fg: theme.text },
        ...cells.flatMap((c, i) => [
          ...(i > 0 ? [{ text: " │ ", fg: theme.borderSubtle }] : []),
          { text: c, fg: theme.text },
        ]),
      ]);
      continue;
    }
    if (line.trim() === "") {
      current.lines.push([{ text: " ", fg: theme.text }]);
      continue;
    }
    current.lines.push(parseInlineMarkdown(line));
  }
  flushCode();
  sections.push(current);
  return sections;
}

function renderStyledLine(ctx: RenderContext, line: StyledLine): BoxRenderable {
  const row = new BoxRenderable(ctx, { flexDirection: "row" });
  for (const seg of line) {
    row.add(new TextRenderable(ctx, { content: seg.text || " ", fg: seg.fg }));
  }
  return row;
}

function updateContent(ctx: RenderContext, box: ScrollBoxRenderable, sections: Section[], fromIndex: number) {
  box.content.getChildren().forEach((c) => box.content.remove(c.id));
  for (let i = fromIndex; i < sections.length; i++) {
    for (const line of sections[i].lines) {
      box.add(renderStyledLine(ctx, line));
    }
  }
  box.requestRender();
}

export function MarkdownScreen(
  renderer: RenderContext,
  doc: ParsedMarkdown,
) {
  const sections = buildSections(doc.raw);

  const tocOptions = doc.headings.length
    ? doc.headings.map((h) => ({
        name: "  ".repeat(Math.max(0, h.level - 1)) + h.text,
        description: "",
        value: h.id,
      }))
    : [{ name: "(no headings)", description: "", value: "" }];

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: "100%",
    options: tocOptions,
    showDescription: false,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.bgMuted,
    selectedTextColor: theme.accent,
    textColor: theme.textMuted,
  });

  const contentBox = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    padding: 2,
    contentOptions: { flexDirection: "column", gap: 0 },
  });

  const sectionIdToIndex = new Map<string, number>();
  sections.forEach((s, i) => sectionIdToIndex.set(s.id, i));

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    const opt = tocOptions[index];
    if (!opt) return;
    const secIdx = sectionIdToIndex.get(opt.value) ?? 0;
    updateContent(renderer, contentBox, sections, secIdx);
  });

  updateContent(renderer, contentBox, sections, 0);

  const body = Box(
    {
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      gap: 0,
    },
    Box(
      { width: SIDEBAR_WIDTH, flexDirection: "column" },
      select
    ),
    Box(
      { width: 1, flexDirection: "column" },
      Text({ content: "│".repeat(200), fg: theme.borderSubtle })
    ),
    contentBox
  );

  return { body, focusables: [select], contentScrollBox: contentBox };
}
