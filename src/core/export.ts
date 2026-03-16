import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AnyParsed, DocsSection, InputSource, PreviewInspectInfo } from "./models.ts";

const CODEBLOCK_TOKEN_RE = /\[\[CODEBLOCK_(\d+)\]\]/g;

export interface SkillExportResult {
  skillName: string;
  directoryPath: string;
  archivePath?: string;
  savedPath: string;
  savedLabel: string;
}

export function supportsSkillExport(doc: AnyParsed): boolean {
  return (
    doc.kind === "docs" ||
    doc.kind === "markdown" ||
    doc.kind === "github-pr" ||
    doc.kind === "table" ||
    doc.kind === "log" ||
    doc.kind === "text"
  );
}

export function renderDocumentForAgent(
  doc: AnyParsed,
  source: InputSource,
  inspectInfo?: PreviewInspectInfo,
): string {
  const parts: string[] = [];
  const title = getExportTitle(doc);
  const sourceLabel = getSourceLabel(doc, source);

  parts.push(`# ${title}`);
  parts.push("");
  parts.push(`Source: ${sourceLabel}`);
  parts.push(`Kind: ${getKindLabel(doc.kind)}`);

  const extractionNotes = getExtractionNotes(inspectInfo);
  if (extractionNotes.length > 0) {
    parts.push("");
    parts.push("## Extraction Notes");
    parts.push(...extractionNotes.map((note) => `- ${note}`));
  }

  switch (doc.kind) {
    case "docs": {
      if (doc.description) {
        parts.push("");
        parts.push("## Description");
        parts.push(doc.description.trim());
      }

      if (doc.sections.length > 0) {
        parts.push("");
        parts.push("## Sections");
        for (const section of doc.sections) {
          parts.push("");
          parts.push(...renderDocsSection(section));
        }
      } else if (doc.mainContent.trim()) {
        parts.push("");
        parts.push("## Content");
        parts.push(doc.mainContent.trim());
      }

      if (doc.links.length > 0) {
        parts.push("");
        parts.push("## Links");
        for (const link of doc.links) {
          parts.push(`- ${formatLink(link.text, link.href)}`);
        }
      }
      break;
    }
    case "markdown": {
      parts.push("");
      parts.push("## Content");
      parts.push(doc.raw.trim() || doc.content.trim() || "(empty)");
      break;
    }
    case "json": {
      parts.push("");
      parts.push("## Summary");
      parts.push(doc.schemaSummary);
      parts.push("");
      parts.push("## JSON");
      parts.push("```json");
      parts.push(JSON.stringify(doc.root, null, 2));
      parts.push("```");
      break;
    }
    case "github-pr": {
      if (doc.author || doc.status) {
        parts.push("");
        parts.push("## Metadata");
        if (doc.author) parts.push(`- Author: ${doc.author}`);
        if (doc.status) parts.push(`- Status: ${doc.status}`);
      }

      if (doc.body.trim()) {
        parts.push("");
        parts.push("## Overview");
        parts.push(doc.body.trim());
      }

      if (doc.files.length > 0) {
        parts.push("");
        parts.push("## Files");
        for (const file of doc.files) {
          const changes = [
            typeof file.additions === "number" ? `+${file.additions}` : "",
            typeof file.deletions === "number" ? `-${file.deletions}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          const suffix = [file.status, changes].filter(Boolean).join(" ");
          parts.push(`- ${file.path}${suffix ? ` (${suffix})` : ""}`);
        }
      }

      if (doc.comments.length > 0) {
        parts.push("");
        parts.push("## Comments");
        for (const comment of doc.comments) {
          parts.push("");
          parts.push(`### ${comment.author ? `@${comment.author}` : "Comment"}`);
          parts.push(comment.body.trim() || "(empty)");
        }
      }
      break;
    }
    case "table": {
      parts.push("");
      parts.push("## Table");
      parts.push(`Columns: ${doc.columns.join(" | ")}`);
      parts.push("");
      parts.push("```text");
      parts.push(doc.raw.trim() || "(empty)");
      parts.push("```");
      break;
    }
    case "log": {
      parts.push("");
      parts.push("## Log Summary");
      parts.push(`Entries: ${doc.entries.length}`);
      parts.push(`Error: ${doc.counts.error} · Warn: ${doc.counts.warn} · Info: ${doc.counts.info}`);
      parts.push("");
      parts.push("## Log");
      parts.push("```text");
      parts.push(doc.raw.trim() || "(empty)");
      parts.push("```");
      break;
    }
    case "dashboard": {
      if (doc.metrics.length > 0) {
        parts.push("");
        parts.push("## Metrics");
        for (const metric of doc.metrics) {
          parts.push(`- ${metric}`);
        }
      }

      if (doc.panels.length > 0) {
        parts.push("");
        parts.push("## Panels");
        for (const panel of doc.panels) {
          parts.push("");
          parts.push(`### ${panel.title || "Panel"}`);
          for (const value of panel.values) {
            parts.push(`- ${value}`);
          }
          for (const link of panel.links ?? []) {
            parts.push(`- ${link}`);
          }
        }
      }
      break;
    }
    case "text": {
      parts.push("");
      parts.push("## Content");
      parts.push(doc.content.trim() || "(empty)");
      break;
    }
  }

  return `${parts.join("\n").trim()}\n`;
}

export async function exportSkillBundle(
  doc: AnyParsed,
  source: InputSource,
  inspectInfo?: PreviewInspectInfo,
  opts?: {
    baseDir?: string;
    now?: Date;
  },
): Promise<SkillExportResult> {
  if (!supportsSkillExport(doc)) {
    throw new Error(`Skill export is not supported for ${doc.kind} content.`);
  }

  const baseDir = opts?.baseDir ?? process.env.OPENPREVIEW_EXPORT_DIR ?? join(process.cwd(), "openpreview-exports");
  const now = opts?.now ?? new Date();
  const skillName = getSkillName(doc, source);
  const stamp = formatTimestamp(now);
  const folderName = `${skillName}-skill-${stamp}`;
  const directoryPath = join(baseDir, folderName);
  const referencesPath = join(directoryPath, "references");

  await mkdir(referencesPath, { recursive: true });

  const sourceMarkdown = renderDocumentForAgent(doc, source, inspectInfo);
  const skillMarkdown = buildSkillMarkdown(doc, source, inspectInfo, skillName);

  await writeFile(join(directoryPath, "SKILL.md"), skillMarkdown, "utf8");
  await writeFile(join(referencesPath, "source.md"), sourceMarkdown, "utf8");

  const archivePath = await createArchive(baseDir, folderName);
  return {
    skillName,
    directoryPath,
    archivePath,
    savedPath: archivePath ?? directoryPath,
    savedLabel: basename(archivePath ?? directoryPath),
  };
}

function buildSkillMarkdown(
  doc: AnyParsed,
  source: InputSource,
  inspectInfo: PreviewInspectInfo | undefined,
  skillName: string,
): string {
  const displayName = getExportTitle(doc);
  const sourceLabel = getSourceLabel(doc, source);
  const description = `Use when the user asks about ${displayName} or needs answers grounded in the extracted content from ${sourceLabel}.`;
  const notes = getExtractionNotes(inspectInfo);

  const lines = [
    "---",
    `name: ${skillName}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# ${displayName}`,
    "",
    "## When to use",
    `Use this skill when the user needs information, terminology, workflows, or explanations from ${sourceLabel}.`,
    "",
    "## Workflow",
    "1. Read `references/source.md` for the extracted source content.",
    "2. Answer from that reference instead of inventing missing details.",
    "3. If the reference notes truncation or JS-heavy rendering, say the extraction may be incomplete.",
    "",
    "## Source",
    `- ${sourceLabel}`,
  ];

  if (notes.length > 0) {
    lines.push("");
    lines.push("## Extraction Notes");
    lines.push(...notes.map((note) => `- ${note}`));
  }

  return `${lines.join("\n").trim()}\n`;
}

function getExportTitle(doc: AnyParsed): string {
  switch (doc.kind) {
    case "docs":
      return doc.title || "Documentation";
    case "markdown":
      return doc.title || "Markdown";
    case "json":
      return "JSON export";
    case "table":
      return "Table export";
    case "log":
      return "Log export";
    case "github-pr":
      return doc.title || "GitHub PR";
    case "dashboard":
      return doc.title || "Dashboard";
    case "text":
      return "Text export";
  }
}

function getSourceLabel(doc: AnyParsed, source: InputSource): string {
  if (doc.kind === "docs" && doc.url) return doc.url;
  if (doc.kind === "github-pr" && doc.url) return doc.url;
  return source.label ?? source.value;
}

function getKindLabel(kind: AnyParsed["kind"]): string {
  switch (kind) {
    case "github-pr":
      return "GitHub PR";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function renderDocsSection(section: DocsSection): string[] {
  const level = Math.min(6, Math.max(1, section.level + 2));
  const heading = `${"#".repeat(level)} ${section.title}`;
  const body = replaceSectionCodeBlocks(section).trim();
  return [heading, "", body || "(empty)"];
}

function replaceSectionCodeBlocks(section: DocsSection): string {
  return (section.content || "").replace(CODEBLOCK_TOKEN_RE, (_match, indexText) => {
    const index = Number(indexText);
    const block = section.codeBlocks?.[index];
    if (!block) return "";
    const language = block.language?.trim() ?? "";
    return `\n\`\`\`${language}\n${block.code.trimEnd()}\n\`\`\`\n`;
  });
}

function formatLink(text: string, href: string): string {
  return text && text !== href ? `[${text}](${href})` : href;
}

function getSkillName(doc: AnyParsed, source: InputSource): string {
  const explicit = getBaseName(doc, source);
  const suffix =
    doc.kind === "docs"
      ? "docs"
      : doc.kind === "markdown"
        ? "notes"
        : doc.kind === "table"
          ? "table"
          : doc.kind === "log"
            ? "logs"
            : "reference";
  return slugify(`${explicit}-${suffix}`);
}

function getBaseName(doc: AnyParsed, source: InputSource): string {
  if (source.type === "url") {
    try {
      const url = new URL(source.value);
      return url.hostname.replace(/^www\./, "").replace(/\.[a-z0-9.-]+$/i, "") || slugify(doc.kind);
    } catch {
      // fall through
    }
  }

  if (doc.kind === "docs" && doc.title) return doc.title;
  if (doc.kind === "markdown" && doc.title) return doc.title;
  if (doc.kind === "github-pr" && doc.title) return doc.title;
  if (doc.kind === "table") return source.label ?? "table";
  if (doc.kind === "log") return source.label ?? "log";
  if (source.label) return source.label;
  return source.value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "skill";
}

function getExtractionNotes(inspectInfo?: PreviewInspectInfo): string[] {
  if (!inspectInfo) return [];
  const notes: string[] = [];
  if (inspectInfo.truncated && inspectInfo.truncationReason) {
    notes.push(inspectInfo.truncationReason);
  }
  if (inspectInfo.jsHeavy) {
    notes.push("The source appeared JS-heavy, so extraction may be incomplete.");
  }
  if (inspectInfo.nextAction) {
    notes.push(inspectInfo.nextAction);
  }
  return notes;
}

function formatTimestamp(date: Date): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

async function createArchive(baseDir: string, folderName: string): Promise<string | undefined> {
  if (!Bun.which("tar")) return undefined;

  const archivePath = join(baseDir, `${folderName}.tar.gz`);
  const proc = Bun.spawn(["tar", "-czf", archivePath, "-C", baseDir, folderName], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    return undefined;
  }
  return archivePath;
}
