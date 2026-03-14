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
import type { ParsedDocs } from "../../core/models.ts";
import {
  highlightCode,
  parseInlineMarkdown,
  wrapText,
  type StyledLine,
} from "../utils/render-content.ts";

const SIDEBAR_WIDTH = 28;
const CODEBLOCK_TOKEN_RE = /\[\[CODEBLOCK_(\d+)\]\]/g;

function buildRenderedLines(doc: ParsedDocs, contentWidth: number): StyledLine[] {
  const lines: StyledLine[] = [];

  if (doc.description) {
    for (const l of wrapText(doc.description, contentWidth)) {
      lines.push([{ text: l, fg: theme.textMuted }]);
    }
    lines.push([{ text: " ", fg: theme.text }]);
  }

  const totalSectionContent = doc.sections.reduce((n, s) => n + (s.content?.length ?? 0), 0);
  const hasSectionCodeBlocks = doc.sections.some((section) => (section.codeBlocks?.length ?? 0) > 0);

  if (totalSectionContent > 100 || hasSectionCodeBlocks) {
    for (const section of doc.sections) {
      lines.push([{ text: section.title, fg: theme.accent }]);
      lines.push([{ text: " ", fg: theme.text }]);
      lines.push(...buildSectionBodyLines(section, contentWidth));
      lines.push([{ text: " ", fg: theme.text }]);
    }
  } else if (doc.mainContent) {
    lines.push(...buildTextLines(doc.mainContent, contentWidth));
    lines.push([{ text: " ", fg: theme.text }]);
  }

  if (doc.sections.length === 0 && doc.codeBlocks.length > 0) {
    for (const block of doc.codeBlocks.slice(0, 10)) {
      lines.push(...buildCodeBlockLines(block, contentWidth));
      lines.push([{ text: " ", fg: theme.text }]);
    }
  }

  if (doc.links.length > 0) {
    lines.push([{ text: "Links", fg: theme.accent }]);
    lines.push([{ text: " ", fg: theme.text }]);
    for (const link of doc.links.slice(0, 20)) {
      lines.push([
        { text: "  ", fg: theme.text },
        { text: link.text || "Link", fg: theme.primary },
        { text: ` → ${link.href}`, fg: theme.textMuted },
      ]);
    }
  }

  return lines;
}

function renderSectionContent(
  ctx: RenderContext,
  detailBox: ScrollBoxRenderable,
  doc: ParsedDocs,
  sectionIndex: number,
) {
  detailBox.content.getChildren().forEach((c) => detailBox.content.remove(c.id));
  const contentWidth = getContentWidth(ctx);

  if (sectionIndex < 0 || doc.sections.length === 0) {
    const allLines = buildRenderedLines(doc, contentWidth);
    for (const line of allLines) {
      const row = new BoxRenderable(ctx, { flexDirection: "row" });
      for (const seg of line) {
        row.add(new TextRenderable(ctx, { content: seg.text || " ", fg: seg.fg }));
      }
      detailBox.add(row);
    }
    detailBox.requestRender();
    return;
  }

  const section = doc.sections[sectionIndex];
  if (!section) { detailBox.requestRender(); return; }

  detailBox.add(new TextRenderable(ctx, { content: section.title, fg: theme.accent }));
  detailBox.add(new TextRenderable(ctx, { content: " ", fg: theme.text }));

  const sectionLines = buildSectionBodyLines(section, contentWidth);
  if (sectionLines.length > 0) {
    for (const line of sectionLines) {
      const row = new BoxRenderable(ctx, { flexDirection: "row" });
      for (const seg of line) {
        row.add(new TextRenderable(ctx, { content: seg.text || " ", fg: seg.fg }));
      }
      detailBox.add(row);
    }
  } else {
    detailBox.add(new TextRenderable(ctx, { content: "(no content for this section)", fg: theme.textMuted }));
  }
  detailBox.requestRender();
}

export function DocsScreen(renderer: RenderContext, doc: ParsedDocs) {
  const sectionOptions = doc.sections.map((s, i) => ({
    name: "  ".repeat(Math.max(0, s.level - 1)) + s.title,
    description: "",
    value: i,
  }));

  const select = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    options: sectionOptions.length
      ? [{ name: "All sections", description: "", value: -1 }, ...sectionOptions]
      : [{ name: "(no sections)", description: "", value: -1 }],
    showDescription: false,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.bgMuted,
    selectedTextColor: theme.accent,
    textColor: theme.textMuted,
  });

  const detailBox = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    padding: 2,
    contentOptions: { flexDirection: "column", gap: 0 },
  });

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    const opt = select.getSelectedOption?.() ?? (sectionOptions.length ? { value: index - 1 } : { value: -1 });
    const val = typeof opt?.value === "number" ? opt.value : -1;
    renderSectionContent(renderer, detailBox, doc, val);
  });

  renderSectionContent(renderer, detailBox, doc, -1);

  const keyLinks = doc.links.slice(0, 12);
  const linkOptions = keyLinks.length
    ? keyLinks.map((l) => ({
        name: l.text || l.href,
        description: "",
        value: l.href,
      }))
    : [{ name: "(no links)", description: "", value: "" }];

  const linksSelect = new SelectRenderable(renderer, {
    width: SIDEBAR_WIDTH,
    height: 8,
    options: linkOptions,
    showDescription: false,
    backgroundColor: theme.bgElevated,
    selectedBackgroundColor: theme.bgMuted,
    selectedTextColor: theme.accent,
    textColor: theme.textMuted,
  });

  const body = Box(
    {
      flexDirection: "row",
      flexGrow: 1,
      width: "100%",
      height: "100%",
      gap: 0,
    },
    Box(
      {
        width: SIDEBAR_WIDTH,
        paddingX: 1,
        paddingY: 1,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: "Sections", fg: theme.textMuted }),
      select,
      Text({ content: "Links", fg: theme.textMuted }),
      linksSelect
    ),
    Box(
      { width: 1, flexDirection: "column" },
      Text({ content: "│".repeat(200), fg: theme.borderSubtle })
    ),
    detailBox
  );

  return {
    body,
    focusables: [select, linksSelect],
    contentScrollBox: detailBox,
  };
}

function buildSectionBodyLines(section: ParsedDocs["sections"][number], contentWidth: number): StyledLine[] {
  const lines: StyledLine[] = [];
  const content = section.content || "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  CODEBLOCK_TOKEN_RE.lastIndex = 0;

  while ((match = CODEBLOCK_TOKEN_RE.exec(content)) !== null) {
    const before = content.slice(cursor, match.index);
    lines.push(...buildTextLines(before, contentWidth));

    const blockIndex = Number(match[1]);
    const block = section.codeBlocks?.[blockIndex];
    if (block) {
      lines.push(...buildCodeBlockLines(block, contentWidth));
      lines.push([{ text: " ", fg: theme.text }]);
    }

    cursor = match.index + match[0].length;
  }

  lines.push(...buildTextLines(content.slice(cursor), contentWidth));

  return trimTrailingBlankLines(lines);
}

function buildTextLines(text: string, contentWidth: number): StyledLine[] {
  const lines: StyledLine[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      lines.push([{ text: " ", fg: theme.text }]);
      continue;
    }

    for (const wrapped of wrapText(line, contentWidth)) {
      lines.push(parseInlineMarkdown(wrapped));
    }
  }

  return trimTrailingBlankLines(lines);
}

function buildCodeBlockLines(block: ParsedDocs["codeBlocks"][number], contentWidth: number): StyledLine[] {
  const lines: StyledLine[] = [];
  lines.push([{ text: `  ┌ ${block.language || "code"}`, fg: theme.textMuted }]);
  const innerWidth = Math.max(16, contentWidth - 4);
  for (const highlighted of highlightCode(block.code)) {
    for (const chunk of wrapStyledLine(highlighted, innerWidth)) {
      lines.push([{ text: "  │ ", fg: theme.borderSubtle }, ...chunk]);
    }
  }
  lines.push([{ text: "  └", fg: theme.textMuted }]);
  return lines;
}

function trimTrailingBlankLines(lines: StyledLine[]): StyledLine[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1]?.length === 1 && out[out.length - 1]?.[0]?.text === " ") {
    out.pop();
  }
  return out;
}

function wrapStyledLine(line: StyledLine, width: number): StyledLine[] {
  if (width <= 0) return [line];

  const wrapped: StyledLine[] = [];
  let current: StyledLine = [];
  let remaining = width;

  const flush = () => {
    if (current.length > 0) wrapped.push(current);
    current = [];
    remaining = width;
  };

  for (const seg of line) {
    let text = seg.text || " ";

    while (text.length > 0) {
      if (remaining === 0) flush();
      const chunk = text.slice(0, remaining);
      if (chunk.length === 0) break;
      current.push({ text: chunk, fg: seg.fg });
      text = text.slice(chunk.length);
      remaining -= chunk.length;
    }
  }

  if (current.length > 0) flush();
  return wrapped.length > 0 ? wrapped : [[{ text: " ", fg: theme.text }]];
}

function getContentWidth(ctx: RenderContext): number {
  return Math.max(20, ctx.width - SIDEBAR_WIDTH - 7);
}
