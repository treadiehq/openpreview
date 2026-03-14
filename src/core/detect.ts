/**
 * Auto-detect content type from raw string (and optional source).
 */

import type {
  ContentType,
  DetectedContent,
  DetectionExplanation,
  DetectionSignal,
  InputSource,
  PreviewMode,
} from "./models.ts";

export function detectContentType(
  raw: string,
  source: InputSource,
  contentType?: string,
  forcedMode: PreviewMode = "auto",
): DetectedContent {
  const forcedType = previewModeToContentType(forcedMode);
  if (forcedType) {
    return withExplanation(raw, source, forcedType, {
      rule: "forced-mode",
      summary: `Forced ${formatContentTypeLabel(forcedType)} mode via --mode ${forcedMode}.`,
      nextAction: undefined,
      signals: [],
      jsHeavy: false,
    });
  }

  const trimmed = (raw ?? "").trim();

  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("application/json")) {
      return withExplanation(raw, source, "json", basicExplanation("content-type", "Detected JSON from the Content-Type header."));
    }
    if (ct.includes("text/markdown")) {
      return withExplanation(raw, source, "markdown", basicExplanation("content-type", "Detected Markdown from the Content-Type header."));
    }
    if (ct.includes("text/html") || ct.includes("application/xhtml"))
      return detectHtmlContent(raw, source, trimmed);
  }

  if (source.type === "url") {
    const pathname = extractPathname(source.value);
    if (pathname.endsWith(".json")) {
      return withExplanation(raw, source, "json", basicExplanation("url-path", "Detected JSON from the URL path."));
    }
    if (pathname.endsWith(".md") || pathname.endsWith(".markdown")) {
      return withExplanation(raw, source, "markdown", basicExplanation("url-path", "Detected Markdown from the URL path."));
    }
    return detectHtmlContent(raw, source, trimmed);
  }

  if (source.type === "file") {
    const lower = source.value.toLowerCase();
    if (lower.endsWith(".json")) {
      return withExplanation(raw, source, "json", basicExplanation("file-extension", "Detected JSON from the file extension."));
    }
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
      return withExplanation(raw, source, "markdown", basicExplanation("file-extension", "Detected Markdown from the file extension."));
    }
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      return detectHtmlContent(raw, source, trimmed);
    }
  }

  if (isLikelyJson(trimmed)) {
    return withExplanation(raw, source, "json", basicExplanation("content-heuristic", "Detected JSON from its top-level structure."));
  }
  if (isLikelyGitHubPR(trimmed)) {
    return withExplanation(raw, source, "github-pr", basicExplanation("content-heuristic", "Detected GitHub PR-like text from pull request markers."));
  }
  if (isLikelyMarkdown(trimmed)) {
    return withExplanation(raw, source, "markdown", basicExplanation("content-heuristic", "Detected Markdown from headings, lists, links, or fences."));
  }

  return withExplanation(raw, source, "text", basicExplanation("fallback", "Fell back to plain text because no richer content type matched."));
}

function previewModeToContentType(mode: PreviewMode): ContentType | null {
  switch (mode) {
    case "auto":
      return null;
    case "docs":
      return "html";
    default:
      return mode;
  }
}

function extractPathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isLikelyJson(s: string): boolean {
  if (!s) return false;
  const t = s.slice(0, 200).trim();
  return (t.startsWith("{") && t.includes("}")) || (t.startsWith("[") && t.includes("]"));
}

function isLikelyMarkdown(s: string): boolean {
  if (!s) return false;
  const first = s.slice(0, 500);
  return (
    /^#{1,6}\s/m.test(first) ||
    /^\s*[-*]\s/m.test(first) ||
    /^\s*\d+\.\s/m.test(first) ||
    /\[.+\]\(.+\)/.test(first) ||
    /^```/m.test(first)
  );
}

function isLikelyGitHubPR(s: string): boolean {
  if (!s) return false;
  return (
    /(pull request|PR #|Merge pull request)/i.test(s) &&
    (/^#\s/.test(s) || /Author:|author:/i.test(s) || /Files? changed/i.test(s))
  );
}

function detectHtmlContent(raw: string, source: InputSource, trimmed: string): DetectedContent {
  const analysis = analyzeHtmlSignals(trimmed);
  const looksLikeDashboard =
    analysis.classBasedSignal ||
    (analysis.structuralSignal && analysis.moderateNumbers) ||
    (analysis.panelLikeClasses && analysis.dashboardKeyword && analysis.moderateNumbers);

  if (looksLikeDashboard) {
    return withExplanation(raw, source, "dashboard", {
      rule: "html-dashboard-heuristic",
      summary: `Detected Dashboard mode from HTML because it matched metric/status signals: ${listMatchedSignals(analysis.dashboardSignals)}.`,
      nextAction: "If this looks wrong, run `preview --mode docs <url>` to force the full docs parser.",
      signals: analysis.allSignals,
      jsHeavy: analysis.jsHeavy,
    });
  }

  return withExplanation(raw, source, "html", {
    rule: "html-default",
    summary: analysis.jsHeavy
      ? "Detected Docs mode from HTML, but the page looks JS-heavy, so preview may only see the server-rendered shell."
      : "Detected Docs mode from HTML content.",
    nextAction: analysis.jsHeavy
      ? "Try a docs/article URL, save the rendered HTML, or use `preview --mode text <url>` if you need the raw shell."
      : undefined,
    signals: analysis.allSignals,
    jsHeavy: analysis.jsHeavy,
  });
}

function withExplanation(
  raw: string,
  source: InputSource,
  type: ContentType,
  explanation: DetectionExplanation,
): DetectedContent {
  return { type, raw, source, explanation };
}

function basicExplanation(rule: string, summary: string): DetectionExplanation {
  return {
    rule,
    summary,
    nextAction: undefined,
    signals: [],
    jsHeavy: false,
  };
}

function formatContentTypeLabel(type: ContentType): string {
  switch (type) {
    case "html":
      return "Docs";
    case "json":
      return "JSON";
    case "github-pr":
      return "GitHub PR";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function listMatchedSignals(signals: DetectionSignal[]): string {
  const matched = signals.filter((signal) => signal.matched).slice(0, 3);
  if (matched.length === 0) return "no strong dashboard-only markers";
  return matched.map((signal) => signal.name).join(", ");
}

interface HtmlSignalAnalysis {
  classBasedSignal: boolean;
  frameworkClasses: boolean;
  panelLikeClasses: boolean;
  ariaRoles: boolean;
  htmlElements: boolean;
  numericTables: boolean;
  dashboardKeyword: boolean;
  structuralSignal: boolean;
  moderateNumbers: boolean;
  jsHeavy: boolean;
  dashboardSignals: DetectionSignal[];
  allSignals: DetectionSignal[];
}

function analyzeHtmlSignals(s: string): HtmlSignalAnalysis {
  const sanitized = stripNonContentHtml(s);
  const lower = sanitized.slice(0, 5000).toLowerCase();
  const visibleText = stripHtmlTags(sanitized);
  const visibleTextLower = visibleText.toLowerCase();
  const title = extractHtmlTitle(sanitized).toLowerCase();

  const classBasedSignal =
    /class\s*=\s*['"][^'"]*(\bmetric\b|\bstat\b|dashboard|kpi)[^'"]*['"]/i.test(lower) ||
    /data-(value|metric|stat)/i.test(lower);

  const frameworkClasses =
    /class\s*=\s*['"][^'"]*(\bwidget\b|\btile\b|\bgauge\b|\bchart\b|\bprogress\b)[^'"]*['"]/i.test(lower);

  const panelLikeClasses =
    /class\s*=\s*['"][^'"]*(\bcard\b|\bpanel\b)[^'"]*['"]/i.test(lower);

  const ariaRoles = /role\s*=\s*['"](status|meter|progressbar)['"]/i.test(lower);
  const htmlElements = /<meter[\s>]|<progress[\s>]/i.test(lower);

  const tableCount = (lower.match(/<table[\s>]/g) || []).length;
  const numericTds = (lower.match(/<td[^>]*>\s*[\d,.]+\s*<\/td>/g) || []).length;
  const numericTables = tableCount >= 3 && numericTds >= 6;

  const dashboardKeyword =
    /\b(dashboard|analytics|report|kpi|status|observability|monitoring)\b/.test(
      `${title} ${visibleTextLower.slice(0, 1200)}`,
    );

  const numberCount = (visibleTextLower.match(/\b\d{1,6}\b/g) || []).length;
  const moderateNumbers = numberCount > 5;
  const scriptTagCount = (s.match(/<script\b/gi) || []).length;
  const headingCount = (s.match(/<h[1-6]\b/gi) || []).length;
  const visibleTextLength = visibleText.length;

  const jsHeavy =
    (scriptTagCount >= 10 && visibleTextLength < 1200) ||
    (scriptTagCount >= 5 && visibleTextLength < 500) ||
    (scriptTagCount >= 5 && headingCount === 0 && visibleTextLength < 800);

  const structuralSignal = frameworkClasses || ariaRoles || htmlElements || numericTables;

  const dashboardSignals: DetectionSignal[] = [
    { name: "metric/stat classes", matched: classBasedSignal },
    { name: "widget/chart/progress classes", matched: frameworkClasses },
    { name: "panel/card classes", matched: panelLikeClasses },
    { name: "status/meter ARIA roles", matched: ariaRoles },
    { name: "meter/progress elements", matched: htmlElements },
    { name: "numeric tables", matched: numericTables, detail: tableCount > 0 ? `${numericTds} numeric cells across ${tableCount} tables` : undefined },
    { name: "dashboard keywords", matched: dashboardKeyword },
    { name: "numeric density", matched: moderateNumbers, detail: `${numberCount} numbers in visible text` },
  ];

  const allSignals: DetectionSignal[] = [
    ...dashboardSignals,
    { name: "script tags", matched: scriptTagCount > 0, detail: `${scriptTagCount}` },
    { name: "visible text length", matched: visibleTextLength > 0, detail: `${visibleTextLength} chars` },
    { name: "heading count", matched: headingCount > 0, detail: `${headingCount}` },
    { name: "js-heavy shell", matched: jsHeavy },
  ];

  return {
    classBasedSignal,
    frameworkClasses,
    panelLikeClasses,
    ariaRoles,
    htmlElements,
    numericTables,
    dashboardKeyword,
    structuralSignal,
    moderateNumbers,
    jsHeavy,
    dashboardSignals,
    allSignals,
  };
}

function stripNonContentHtml(s: string): string {
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractHtmlTitle(s: string): string {
  const match = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}
