import { marked } from "marked";
import type { InputSource, ParsedMarkdown } from "../models.ts";

export async function parseMarkdown(raw: string, _source: InputSource): Promise<ParsedMarkdown> {
  if (!raw || !raw.trim()) {
    return { kind: "markdown", title: undefined, headings: [], codeBlocks: [], content: "", raw: "" };
  }
  const headings: ParsedMarkdown["headings"] = [];
  const codeBlocks: ParsedMarkdown["codeBlocks"] = [];
  const lexer = marked.lexer(raw);

  for (const tok of lexer) {
    if (tok.type === "heading") {
      const text = typeof tok.text === "string" ? tok.text : "";
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      headings.push({ level: tok.depth, text, id });
    }
    if (tok.type === "code" && tok.text) {
      codeBlocks.push({ language: tok.lang ?? undefined, code: tok.text });
    }
  }

  const content = (await marked.parse(raw)) as string;
  const title = headings.find((h) => h.level === 1)?.text;

  return {
    kind: "markdown",
    title,
    headings,
    codeBlocks,
    content,
    raw,
  };
}
