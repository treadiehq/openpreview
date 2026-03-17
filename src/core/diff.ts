import type { LoadedPreview } from "./preview-session.ts";
import type {
  AnyParsed,
  DiffEntry,
  DiffStatus,
  ParsedDiff,
  ParsedJson,
  ParsedLog,
  ParsedTable,
} from "./models.ts";

const MAX_JSON_DIFF_ENTRIES = 120;
const MAX_TEXT_DIFF_ENTRIES = 80;

export function buildPreviewDiff(left: LoadedPreview, right: LoadedPreview): ParsedDiff {
  const entries = compareDocuments(left.doc, right.doc);
  const stats = summarizeStatuses(entries);
  const summary = buildSummary(left.doc, right.doc, stats);

  return {
    kind: "diff",
    title: "Preview diff",
    summary,
    leftLabel: getSourceLabel(left),
    rightLabel: getSourceLabel(right),
    leftKind: left.doc.kind,
    rightKind: right.doc.kind,
    entries: entries.length > 0
      ? entries
      : [
          {
            id: "no-diff",
            title: "No differences detected",
            status: "unchanged",
            category: "summary",
            detail: "The parsed content matched across both inputs.",
          },
        ],
    stats,
  };
}

function compareDocuments(left: AnyParsed, right: AnyParsed): DiffEntry[] {
  if (left.kind !== right.kind) {
    return compareFallback(left, right, [
      {
        id: "kind-changed",
        title: "Parsed mode changed",
        status: "changed",
        category: "summary",
        before: left.kind,
        after: right.kind,
        detail: "The two inputs parsed into different content kinds, so the diff falls back to rendered text.",
      },
    ]);
  }

  switch (left.kind) {
    case "docs":
      return compareDocs(left, right);
    case "json":
      return compareJson(left, right);
    case "log":
      return compareLogs(left, right);
    case "table":
      return compareTables(left, right);
    case "markdown":
      return compareLines(left.raw, right.raw, "Line");
    case "github-pr":
      return compareLines(renderGitHubPR(left), renderGitHubPR(right), "Line");
    case "dashboard":
      return compareLines(renderDashboard(left), renderDashboard(right), "Line");
    case "text":
      return compareLines(left.content, right.content, "Line");
    case "diff":
      return compareLines(renderDiff(left), renderDiff(right), "Line");
    default:
      return compareFallback(left, right);
  }
}

function compareDocs(left: Extract<AnyParsed, { kind: "docs" }>, right: Extract<AnyParsed, { kind: "docs" }>): DiffEntry[] {
  const entries: DiffEntry[] = [];

  maybePush(entries, "docs-title", "Title", left.title, right.title);
  maybePush(entries, "docs-description", "Description", left.description ?? "", right.description ?? "");

  const leftSections = new Map(left.sections.map((section) => [section.id || section.title, section]));
  const rightSections = new Map(right.sections.map((section) => [section.id || section.title, section]));
  const keys = new Set([...leftSections.keys(), ...rightSections.keys()]);

  for (const key of [...keys].sort()) {
    const leftSection = leftSections.get(key);
    const rightSection = rightSections.get(key);
    const title = rightSection?.title ?? leftSection?.title ?? key;

    if (!leftSection && rightSection) {
      entries.push({
        id: `section-added:${key}`,
        title,
        status: "added",
        category: "section",
        after: renderDocsSection(rightSection),
      });
      continue;
    }

    if (leftSection && !rightSection) {
      entries.push({
        id: `section-removed:${key}`,
        title,
        status: "removed",
        category: "section",
        before: renderDocsSection(leftSection),
      });
      continue;
    }

    if (leftSection && rightSection) {
      const before = renderDocsSection(leftSection);
      const after = renderDocsSection(rightSection);
      if (before !== after) {
        entries.push({
          id: `section-changed:${key}`,
          title,
          status: "changed",
          category: "section",
          before,
          after,
        });
      }
    }
  }

  const linkDelta = summarizeSetDiff(
    new Set(left.links.map((link) => link.href)),
    new Set(right.links.map((link) => link.href)),
  );
  if (linkDelta) {
    entries.push({
      id: "docs-links",
      title: "Link set changed",
      status: "changed",
      category: "summary",
      detail: linkDelta,
    });
  }

  return entries;
}

function compareJson(left: ParsedJson, right: ParsedJson): DiffEntry[] {
  const entries: DiffEntry[] = [];
  maybePush(entries, "json-classification", "Classification", left.classification, right.classification);
  maybePush(entries, "json-schema", "Schema summary", left.schemaSummary, right.schemaSummary);

  diffJsonValue(left.root, right.root, "$", entries, { count: 0 });

  if (left.errorSummary || right.errorSummary) {
    maybePush(entries, "json-error", "Error summary", left.errorSummary ?? "", right.errorSummary ?? "");
  }

  if (left.pagination || right.pagination) {
    maybePush(
      entries,
      "json-pagination",
      "Pagination",
      formatPagination(left.pagination),
      formatPagination(right.pagination),
    );
  }

  return entries;
}

function compareLogs(left: ParsedLog, right: ParsedLog): DiffEntry[] {
  const entries: DiffEntry[] = [];
  maybePush(entries, "log-entry-count", "Entry count", String(left.entries.length), String(right.entries.length));
  maybePush(entries, "log-errors", "Error count", String(left.counts.error), String(right.counts.error));
  maybePush(entries, "log-warns", "Warn count", String(left.counts.warn), String(right.counts.warn));

  const leftGroups = buildLogGroupMap(left);
  const rightGroups = buildLogGroupMap(right);
  const keys = new Set([...leftGroups.keys(), ...rightGroups.keys()]);

  for (const key of [...keys].sort()) {
    const leftGroup = leftGroups.get(key);
    const rightGroup = rightGroups.get(key);
    const title = rightGroup?.message ?? leftGroup?.message ?? key;

    if (!leftGroup && rightGroup) {
      entries.push({
        id: `log-added:${key}`,
        title,
        status: "added",
        category: "issue",
        after: formatLogGroup(rightGroup),
      });
      continue;
    }

    if (leftGroup && !rightGroup) {
      entries.push({
        id: `log-removed:${key}`,
        title,
        status: "removed",
        category: "issue",
        before: formatLogGroup(leftGroup),
      });
      continue;
    }

    if (leftGroup && rightGroup && leftGroup.count !== rightGroup.count) {
      entries.push({
        id: `log-count:${key}`,
        title,
        status: "changed",
        category: "issue",
        before: formatLogGroup(leftGroup),
        after: formatLogGroup(rightGroup),
      });
    }
  }

  return entries;
}

function compareTables(left: ParsedTable, right: ParsedTable): DiffEntry[] {
  const entries: DiffEntry[] = [];
  maybePush(entries, "table-columns", "Columns", left.columns.join(" | "), right.columns.join(" | "));
  maybePush(entries, "table-row-count", "Row count", String(left.rows.length), String(right.rows.length));

  const leftRows = new Set(left.rows.map((row) => row.join("\t")));
  const rightRows = new Set(right.rows.map((row) => row.join("\t")));

  for (const value of [...rightRows].filter((row) => !leftRows.has(row)).slice(0, 30)) {
    entries.push({
      id: `table-added:${value}`,
      title: "Row added",
      status: "added",
      category: "row",
      after: value,
    });
  }
  for (const value of [...leftRows].filter((row) => !rightRows.has(row)).slice(0, 30)) {
    entries.push({
      id: `table-removed:${value}`,
      title: "Row removed",
      status: "removed",
      category: "row",
      before: value,
    });
  }

  return entries;
}

function compareFallback(left: AnyParsed, right: AnyParsed, prefix: DiffEntry[] = []): DiffEntry[] {
  return [
    ...prefix,
    ...compareLines(renderFallback(left), renderFallback(right), "text"),
  ];
}

function compareLines(left: string, right: string, lineTitlePrefix: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const leftLines = normalizeLines(left);
  const rightLines = normalizeLines(right);
  const max = Math.max(leftLines.length, rightLines.length);

  for (let index = 0; index < max && entries.length < MAX_TEXT_DIFF_ENTRIES; index++) {
    const before = leftLines[index];
    const after = rightLines[index];

    if (before === after) continue;
    if (before === undefined) {
      entries.push({
        id: `line-added:${index}`,
        title: `${lineTitlePrefix} ${index + 1}`,
        status: "added",
        category: "line",
        after,
      });
      continue;
    }
    if (after === undefined) {
      entries.push({
        id: `line-removed:${index}`,
        title: `${lineTitlePrefix} ${index + 1}`,
        status: "removed",
        category: "line",
        before,
      });
      continue;
    }
    entries.push({
      id: `line-changed:${index}`,
      title: `${lineTitlePrefix} ${index + 1}`,
      status: "changed",
      category: "line",
      before,
      after,
    });
  }

  return entries;
}

function diffJsonValue(
  left: unknown,
  right: unknown,
  path: string,
  entries: DiffEntry[],
  counter: { count: number },
): void {
  if (counter.count >= MAX_JSON_DIFF_ENTRIES) return;

  if (left === right) return;

  const leftType = getJsonKind(left);
  const rightType = getJsonKind(right);

  if (leftType !== rightType) {
    entries.push({
      id: `json-type:${path}`,
      title: path,
      status: "changed",
      category: "path",
      before: formatJsonValue(left),
      after: formatJsonValue(right),
      detail: `Type changed from ${leftType} to ${rightType}.`,
    });
    counter.count++;
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      entries.push({
        id: `json-array-len:${path}`,
        title: path,
        status: "changed",
        category: "path",
        before: `length ${left.length}`,
        after: `length ${right.length}`,
      });
      counter.count++;
      if (counter.count >= MAX_JSON_DIFF_ENTRIES) return;
    }
    const max = Math.min(Math.max(left.length, right.length), 20);
    for (let index = 0; index < max; index++) {
      diffJsonValue(left[index], right[index], `${path}[${index}]`, entries, counter);
      if (counter.count >= MAX_JSON_DIFF_ENTRIES) return;
    }
    return;
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([
      ...Object.keys(left as Record<string, unknown>),
      ...Object.keys(right as Record<string, unknown>),
    ]);
    for (const key of [...keys].sort()) {
      const leftValue = (left as Record<string, unknown>)[key];
      const rightValue = (right as Record<string, unknown>)[key];
      const childPath = path === "$" ? key : `${path}.${key}`;

      if (!(key in (left as Record<string, unknown>))) {
        entries.push({
          id: `json-added:${childPath}`,
          title: childPath,
          status: "added",
          category: "path",
          after: formatJsonValue(rightValue),
        });
        counter.count++;
        continue;
      }
      if (!(key in (right as Record<string, unknown>))) {
        entries.push({
          id: `json-removed:${childPath}`,
          title: childPath,
          status: "removed",
          category: "path",
          before: formatJsonValue(leftValue),
        });
        counter.count++;
        continue;
      }

      diffJsonValue(leftValue, rightValue, childPath, entries, counter);
      if (counter.count >= MAX_JSON_DIFF_ENTRIES) return;
    }
    return;
  }

  entries.push({
    id: `json-changed:${path}`,
    title: path,
    status: "changed",
    category: "path",
    before: formatJsonValue(left),
    after: formatJsonValue(right),
  });
  counter.count++;
}

function maybePush(entries: DiffEntry[], id: string, title: string, before: string, after: string): void {
  if (before === after) return;
  entries.push({
    id,
    title,
    status: "changed",
    category: "summary",
    before: before || "(empty)",
    after: after || "(empty)",
  });
}

function summarizeStatuses(entries: DiffEntry[]): ParsedDiff["stats"] {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { added: 0, removed: 0, changed: 0, unchanged: 0 },
  );
}

function buildSummary(left: AnyParsed, right: AnyParsed, stats: ParsedDiff["stats"]): string {
  const parts = [
    `${stats.changed} changed`,
    `${stats.added} added`,
    `${stats.removed} removed`,
  ];
  if (left.kind !== right.kind) {
    parts.unshift(`mode changed ${left.kind} -> ${right.kind}`);
  }
  return parts.join(" · ");
}

function getSourceLabel(loaded: LoadedPreview): string {
  if (loaded.doc.kind === "docs" && loaded.doc.url) return loaded.doc.url;
  return loaded.source.label ?? loaded.source.value;
}

function normalizeLines(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

function renderDocsSection(section: Extract<AnyParsed, { kind: "docs" }>["sections"][number]): string {
  return [section.title, section.content.trim()].filter(Boolean).join("\n\n");
}

function renderGitHubPR(doc: Extract<AnyParsed, { kind: "github-pr" }>): string {
  return [
    doc.title,
    doc.body,
    doc.files.map((file) => file.path).join("\n"),
    doc.comments.map((comment) => comment.body).join("\n\n"),
  ].join("\n\n");
}

function renderDashboard(doc: Extract<AnyParsed, { kind: "dashboard" }>): string {
  return [
    doc.title,
    doc.metrics.join("\n"),
    doc.panels.map((panel) => [panel.title ?? "Panel", ...panel.values].join("\n")).join("\n\n"),
  ].join("\n\n");
}

function renderFallback(doc: AnyParsed): string {
  switch (doc.kind) {
    case "markdown":
      return doc.raw;
    case "github-pr":
      return renderGitHubPR(doc);
    case "dashboard":
      return renderDashboard(doc);
    case "json":
      return JSON.stringify(doc.root, null, 2);
    case "table":
      return doc.raw;
    case "log":
      return doc.raw;
    case "docs":
      return [doc.title, doc.description ?? "", doc.mainContent].join("\n\n");
    case "diff":
      return renderDiff(doc);
    default:
      return doc.content;
  }
}

function renderDiff(doc: Extract<AnyParsed, { kind: "diff" }>): string {
  return [
    doc.title,
    doc.summary,
    doc.entries.map((entry) => `${entry.status}: ${entry.title}`).join("\n"),
  ].join("\n\n");
}

function getJsonKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function formatJsonValue(value: unknown): string {
  if (value === undefined) return "(missing)";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  return JSON.stringify(value, null, 2);
}

function formatPagination(pagination: ParsedJson["pagination"]): string {
  if (!pagination) return "(none)";
  return [
    pagination.itemPath ? `items ${pagination.itemPath}` : "",
    pagination.totalPath ? `total ${pagination.totalPath}` : "",
    pagination.nextPath ? `next ${pagination.nextPath}` : "",
    pagination.hasMore !== undefined ? `hasMore ${String(pagination.hasMore)}` : "",
  ].filter(Boolean).join(" · ");
}

function buildLogGroupMap(doc: ParsedLog): Map<string, ParsedLog["groups"][number]> {
  const map = new Map<string, ParsedLog["groups"][number]>();

  for (const group of doc.groups) {
    const existing = map.get(group.key);
    if (existing) {
      existing.count += group.count;
      existing.entries.push(...group.entries);
      existing.lastIndex = group.lastIndex;
      existing.raw = `${existing.raw}\n${group.raw}`;
      continue;
    }
    map.set(group.key, { ...group, entries: [...group.entries] });
  }

  return map;
}

function formatLogGroup(group: ParsedLog["groups"][number]): string {
  return `${group.level.toUpperCase()} x${group.count}\n${group.message}`;
}

function summarizeSetDiff(left: Set<string>, right: Set<string>): string | undefined {
  const added = [...right].filter((value) => !left.has(value));
  const removed = [...left].filter((value) => !right.has(value));
  if (added.length === 0 && removed.length === 0) return undefined;

  const parts: string[] = [];
  if (added.length > 0) parts.push(`${added.length} added`);
  if (removed.length > 0) parts.push(`${removed.length} removed`);
  return parts.join(" · ");
}
