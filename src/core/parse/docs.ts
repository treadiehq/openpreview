import * as cheerio from "cheerio";
import { isTag, isText } from "domhandler";
import type { AnyNode } from "domhandler";
import type { InputSource, ParsedDocs } from "../models.ts";
const CODEBLOCK_TOKEN_PREFIX = "[[CODEBLOCK_";
const CODEBLOCK_TOKEN_RE = /\[\[CODEBLOCK_(\d+)\]\]/g;

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "details",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const ARTICLE_HINT_SELECTOR = [
  "article",
  "[itemprop='articleBody']",
  "[data-pagefind-body]",
  ".prose",
  ".markdown",
  ".mdx-content",
  ".docs-content",
  ".documentation",
  "#content",
  ".content",
].join(", ");

const STRIP_SELECTOR = [
  "script",
  "style",
  "nav",
  "header",
  "footer",
  "aside",
  "noscript",
  "svg",
  "[aria-hidden='true']",
].join(", ");

export function parseDocs(html: string, source: InputSource): ParsedDocs {
  if (!html || !html.trim()) {
    return {
      kind: "docs",
      title: "Untitled",
      description: undefined,
      url: source.type === "url" ? source.value : "",
      sections: [],
      links: [],
      codeBlocks: [],
      mainContent: "No readable content found.",
    };
  }
  const $ = cheerio.load(html);

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "Untitled";
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim();

  const cleanRoot = selectContentRoot($).clone();
  cleanRoot.find(STRIP_SELECTOR).remove();
  pruneNoiseContainers($, cleanRoot);

  const sections = extractSections($, cleanRoot);
  const fullText = normalizeText(cleanRoot.text());

  const links: ParsedDocs["links"] = [];
  cleanRoot.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = normalizeText($(el).text());
    const resolvedHref = resolveHref(href, source.type === "url" ? source.value : "");
    if (resolvedHref && text && !resolvedHref.startsWith("#")) {
      links.push({ href: resolvedHref, text });
    }
  });

  const codeBlocks: ParsedDocs["codeBlocks"] = [];
  cleanRoot.find("pre code, pre").each((_, el) => {
    const code = $(el).text().trim();
    if (!code || code.length < 5) return;
    if (codeBlocks.some((b) => b.code === code)) return;
    const lang =
      $(el).attr("class")?.match(/language-(\w+)/)?.[1] ??
      $(el).find("code").first().attr("class")?.match(/language-(\w+)/)?.[1] ??
      undefined;
    codeBlocks.push({ language: lang, code });
  });

  const url = source.type === "url" ? source.value : "";

  return {
    kind: "docs",
    title,
    description,
    url,
    sections,
    links,
    codeBlocks,
    mainContent: fullText || "No readable content found.",
  };
}

function selectContentRoot($: cheerio.CheerioAPI) {
  const main = $("main").first();
  if (main.length) {
    const articleLike = main.find(ARTICLE_HINT_SELECTOR).filter((_, el) => normalizeText($(el).text()).length > 120).first();
    return articleLike.length ? articleLike : main;
  }

  const article = $("article").filter((_, el) => normalizeText($(el).text()).length > 120).first();
  if (article.length) return article;

  const roleMain = $("[role='main']").first();
  if (roleMain.length) return roleMain;

  const hinted = $(ARTICLE_HINT_SELECTOR).filter((_, el) => normalizeText($(el).text()).length > 120).first();
  if (hinted.length) return hinted;

  return $("body").first();
}

function pruneNoiseContainers($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>) {
  root.find("*").each((_, el) => {
    if (!isTag(el)) return;
    if (isNoiseContainer($, el)) {
      $(el).remove();
    }
  });
}

function isNoiseContainer($: cheerio.CheerioAPI, node: AnyNode): boolean {
  if (!isTag(node)) return false;
  const tagName = node.tagName.toLowerCase();
  if (tagName === "nav" || tagName === "header" || tagName === "footer" || tagName === "aside") return true;

  const $node = $(node);
  const role = ($node.attr("role") || "").toLowerCase();
  if (role === "navigation" || role === "complementary") return true;

  const ariaLabel = [
    $node.attr("aria-label"),
    $node.attr("aria-labelledby"),
    $node.attr("data-testid"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(table of contents|on this page|breadcrumb|pagination|sidebar|primary navigation|secondary navigation)\b/.test(ariaLabel)) {
    return true;
  }

  const classAndId = `${$node.attr("class") || ""} ${$node.attr("id") || ""}`.toLowerCase();
  if (/\b(toc|table-of-contents|sidebar|breadcrumbs?|pagination|pager|skiplinks?|navbar|outline|on-this-page)\b/.test(classAndId)) {
    return true;
  }

  if (tagName === "div" || tagName === "section") {
    const anchors = $node.find("a[href]").length;
    const nonLinkTextLength = normalizeText(
      $node
        .clone()
        .find("a")
        .remove()
        .end()
        .text(),
    ).length;

    if (anchors >= 4 && nonLinkTextLength < 80) {
      return true;
    }
  }

  return false;
}

function extractSections($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): ParsedDocs["sections"] {
  const sections: Array<ParsedDocs["sections"][number] & { fragments: string[] }> = [];
  let currentSection: (typeof sections)[number] | null = null;

  const appendText = (value: string) => {
    const text = normalizeText(value);
    if (!text) return;
    if (currentSection) {
      const prev = currentSection.fragments[currentSection.fragments.length - 1];
      if (!prev || prev.endsWith("\n")) {
        currentSection.fragments.push(text);
        return;
      }
      if (prev.startsWith(CODEBLOCK_TOKEN_PREFIX)) {
        currentSection.fragments.push(text);
        return;
      }
      currentSection.fragments[currentSection.fragments.length - 1] = `${prev} ${text}`;
    }
  };

  const appendCodeBlock = (node: AnyNode) => {
    if (!currentSection || !isTag(node)) return;
    const code = $(node).text().trimEnd();
    if (!code) return;

    const lang =
      $(node).attr("class")?.match(/language-(\w+)/)?.[1] ??
      $(node).find("code").first().attr("class")?.match(/language-(\w+)/)?.[1] ??
      undefined;

    const codeBlocks = currentSection.codeBlocks ?? (currentSection.codeBlocks = []);
    const existingIndex = codeBlocks.findIndex((block) => block.code === code && block.language === lang);
    const index = existingIndex >= 0 ? existingIndex : codeBlocks.push({ language: lang, code }) - 1;
    currentSection.fragments.push(`[[CODEBLOCK_${index}]]`);
  };

  const appendBlockBreak = () => {
    if (!currentSection || currentSection.fragments.length === 0) return;
    const prev = currentSection.fragments[currentSection.fragments.length - 1];
    if (!prev) return;
    if (prev === "\n") return;
    if (prev.startsWith(CODEBLOCK_TOKEN_PREFIX)) {
      currentSection.fragments.push("\n");
      return;
    }
    currentSection.fragments[currentSection.fragments.length - 1] = prev.replace(/\s+$/g, "");
    currentSection.fragments.push("\n");
  };

  const shouldIgnoreTextNode = (node: AnyNode): boolean => {
    if (!isText(node)) return false;
    const parent = node.parent;
    if (!parent || !isTag(parent)) return false;
    if (parent.tagName.toLowerCase() === "pre") return false;
    if (!/^\s*(?:0?[1-9]|[1-9][0-9])\s*$/.test(node.data)) return false;
    const next = nextMeaningfulNode(node.next);
    return isHeadingNode(next);
  };

  const visit = (node: AnyNode) => {
    if (isText(node)) {
      if (shouldIgnoreTextNode(node)) return;
      appendText(node.data);
      return;
    }

    if (!isTag(node)) return;
    if (isNoiseContainer($, node)) return;

    const tagName = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      dropTrailingDecorativeFragments(currentSection);
      const title = normalizeText($(node).text());
      if (!title || title.length < 2) return;
      currentSection = {
        id: $(node).attr("id") || slugify(title),
        level: parseInt(tagName.slice(1), 10),
        title,
        content: "",
        fragments: [],
        codeBlocks: [],
      };
      sections.push(currentSection);
      return;
    }

    if (tagName === "br") {
      appendBlockBreak();
      return;
    }

    if (tagName === "pre") {
      appendCodeBlock(node);
      appendBlockBreak();
      return;
    }

    for (const child of node.children ?? []) {
      visit(child);
    }

    if (BLOCK_TAGS.has(tagName)) {
      appendBlockBreak();
    }
  };

  for (const node of root.get(0)?.children ?? []) {
    visit(node);
  }

  return sections
    .map(({ fragments, ...section }) => ({
      ...section,
      content: finalizeSectionContent(fragments),
      codeBlocks: section.codeBlocks ?? [],
    }))
    .filter((section, index, arr) => {
      if (!section.title) return false;
      if (index === 0) return true;
      const prev = arr[index - 1];
      return prev.title !== section.title || prev.level !== section.level || section.content.length > 0;
    });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function finalizeSectionContent(fragments: string[]): string {
  return fragments
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(CODEBLOCK_TOKEN_RE, (match) => `\n${match}\n`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dropTrailingDecorativeFragments(section: (ParsedDocs["sections"][number] & { fragments: string[] }) | null) {
  if (!section) return;

  while (section.fragments.length > 0 && section.fragments[section.fragments.length - 1] === "\n") {
    section.fragments.pop();
  }

  const last = section.fragments[section.fragments.length - 1];
  if (last && /^(?:0?[1-9]|[1-9][0-9])$/.test(last)) {
    section.fragments.pop();
  }

  while (section.fragments.length > 0 && section.fragments[section.fragments.length - 1] === "\n") {
    section.fragments.pop();
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function resolveHref(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return undefined;

  try {
    return new URL(href, baseUrl || undefined).toString();
  } catch {
    return href.startsWith("/") || href.startsWith("#") ? undefined : href;
  }
}

function nextMeaningfulNode(node: AnyNode | null | undefined): AnyNode | null {
  let current = node ?? null;
  while (current) {
    if (isText(current) && normalizeText(current.data).length === 0) {
      current = current.next ?? null;
      continue;
    }
    return current;
  }
  return null;
}

function isHeadingNode(node: AnyNode | null | undefined): boolean {
  return Boolean(node && isTag(node) && /^h[1-6]$/i.test(node.tagName));
}
