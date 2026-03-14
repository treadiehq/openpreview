import type { AnyParsed, PreviewInspectInfo } from "./models.ts";
import type { LoadedPreview } from "./preview-session.ts";

export function buildExplainReport(loaded: LoadedPreview): string {
  const { doc, source, inspectInfo } = loaded;
  const lines = [
    "preview explain",
    "",
    `Source: ${inspectInfo.sourceType}`,
    `Input: ${source.value}`,
    `Forced mode: ${formatModeLabel(inspectInfo.forcedMode)}`,
    `Detected mode: ${formatDetectedMode(inspectInfo.detectedType)}`,
    `Parser: ${formatModeLabel(doc.kind)}`,
    `Content-Type: ${inspectInfo.contentType ?? "(none)"}`,
    `Bytes: ${formatBytes(inspectInfo.displayedBytes)} shown / ${formatBytes(inspectInfo.totalBytes)} fetched`,
    `Truncated: ${inspectInfo.truncated ? "yes" : "no"}`,
    `Reason: ${inspectInfo.detectionSummary}`,
    `JS-heavy shell: ${inspectInfo.jsHeavy ? "yes" : "no"}`,
  ];

  if (inspectInfo.truncationReason) {
    lines.push(`Truncation: ${inspectInfo.truncationReason}`);
  }
  if (inspectInfo.nextAction) {
    lines.push(`Next step: ${inspectInfo.nextAction}`);
  }

  lines.push("");
  lines.push("Signals:");

  const matchedSignals = inspectInfo.signals.filter((signal) => signal.matched);
  if (matchedSignals.length === 0) {
    lines.push("- none");
  } else {
    for (const signal of matchedSignals) {
      lines.push(`- ${signal.detail ? `${signal.name}: ${signal.detail}` : signal.name}`);
    }
  }

  const stats = getDocumentStats(doc);
  if (stats.length > 0) {
    lines.push("");
    lines.push("Document:");
    for (const [label, value] of stats) {
      lines.push(`- ${label}: ${value}`);
    }
  }

  return lines.join("\n");
}

function getDocumentStats(doc: AnyParsed): Array<[string, string]> {
  switch (doc.kind) {
    case "docs":
      return [
        ["Title", doc.title],
        ["Sections", String(doc.sections.length)],
        ["Links", String(doc.links.length)],
        ["Code blocks", String(doc.codeBlocks.length)],
      ];
    case "dashboard":
      return [
        ["Title", doc.title],
        ["Panels", String(doc.panels.length)],
        ["Metrics", String(doc.metrics.length)],
        ["Links", String(doc.links.length)],
      ];
    case "json":
      return [
        ["Summary", doc.schemaSummary],
        ["Array of objects", doc.isArrayOfObjects ? "yes" : "no"],
      ];
    case "markdown":
      return [
        ["Title", doc.title ?? "Markdown"],
        ["Headings", String(doc.headings.length)],
        ["Code blocks", String(doc.codeBlocks.length)],
      ];
    case "github-pr":
      return [
        ["Title", doc.title],
        ["Files", String(doc.files.length)],
        ["Comments", String(doc.comments.length)],
      ];
    case "text":
      return [
        ["Lines", String(doc.content.split("\n").length)],
        ["Characters", String(doc.content.length)],
      ];
  }
}

function formatModeLabel(mode: string): string {
  switch (mode) {
    case "github-pr":
      return "GitHub PR";
    case "json":
      return "JSON";
    case "docs":
    case "html":
      return "Docs";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}

function formatDetectedMode(type: PreviewInspectInfo["detectedType"]): string {
  return type === "html" ? "Docs" : formatModeLabel(type);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
