/**
 * Shared models for input source, content type, and parsed documents.
 * Keeps the pipeline typed and extensible for new modes.
 */

export type InputSourceType = "url" | "file" | "stdin" | "command";
export type PreviewMode =
  | "auto"
  | "docs"
  | "dashboard"
  | "json"
  | "markdown"
  | "github-pr"
  | "table"
  | "log"
  | "text";

export interface InputSource {
  type: InputSourceType;
  /** URL, file path, or "stdin" */
  value: string;
  /** Optional display label (e.g. filename, truncated URL) */
  label?: string;
  /** Optional argv or shell tokens for command execution */
  args?: string[];
}

export type ContentType =
  | "html"
  | "json"
  | "markdown"
  | "text"
  | "github-pr"
  | "dashboard"
  | "table"
  | "log";

export interface DetectedContent {
  type: ContentType;
  /** Raw string for parsing */
  raw: string;
  source: InputSource;
  explanation?: DetectionExplanation;
}

export interface DetectionSignal {
  name: string;
  matched: boolean;
  detail?: string;
}

export interface DetectionExplanation {
  rule: string;
  summary: string;
  nextAction?: string;
  signals: DetectionSignal[];
  jsHeavy: boolean;
}

export interface PreviewInspectInfo {
  sourceType: InputSourceType;
  forcedMode: PreviewMode;
  detectedType: ContentType;
  contentType?: string;
  durationMs?: number;
  statusCode?: number;
  finalUrl?: string;
  exitCode?: number;
  stderrBytes?: number;
  cached?: boolean;
  totalBytes: number;
  displayedBytes: number;
  truncated: boolean;
  truncationReason?: string;
  detectionSummary: string;
  nextAction?: string;
  signals: DetectionSignal[];
  jsHeavy: boolean;
}

// --- Docs (HTML) model ---
export interface DocsSection {
  id: string;
  level: number;
  title: string;
  content: string;
  codeBlocks?: DocsCodeBlock[];
}

export interface DocsLink {
  href: string;
  text: string;
}

export interface DocsCodeBlock {
  language?: string;
  code: string;
}

export interface ParsedDocs {
  kind: "docs";
  title: string;
  description?: string;
  url: string;
  sections: DocsSection[];
  links: DocsLink[];
  codeBlocks: DocsCodeBlock[];
  /** Main readable content (e.g. article body) */
  mainContent: string;
}

// --- JSON model ---
export type JsonNode = JsonObject | JsonArray | JsonPrimitive;
export interface JsonObject {
  type: "object";
  keys: string[];
  value: Record<string, unknown>;
}
export interface JsonArray {
  type: "array";
  length: number;
  value: unknown[];
  /** If array of objects, inferred keys for table view */
  inferredKeys?: string[];
}
export type JsonPrimitive = string | number | boolean | null;

export interface ParsedJson {
  kind: "json";
  root: unknown;
  /** Top-level keys or array length summary */
  schemaSummary: string;
  isArrayOfObjects: boolean;
  /** For table view */
  rows?: Record<string, unknown>[];
  /** For tree view */
  node: JsonNode | null;
  classification: "object" | "array" | "error" | "paginated" | "schema" | "primitive";
  entries: JsonEntrySummary[];
  errorSummary?: string;
  pagination?: JsonPaginationInfo;
  anomalies: string[];
}

export interface JsonEntrySummary {
  path: string;
  label: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  preview: string;
  value: unknown;
}

export interface JsonPaginationInfo {
  itemPath?: string;
  nextPath?: string;
  totalPath?: string;
  count?: number;
  hasMore?: boolean;
}

// --- Markdown model ---
export interface MarkdownHeading {
  level: number;
  text: string;
  id: string;
}

export interface MarkdownCodeBlock {
  language?: string;
  code: string;
}

export interface ParsedMarkdown {
  kind: "markdown";
  title?: string;
  headings: MarkdownHeading[];
  codeBlocks: MarkdownCodeBlock[];
  /** Rendered or raw content for display */
  content: string;
  raw: string;
}

// --- GitHub PR model ---
export interface GitHubPRComment {
  author?: string;
  body: string;
  date?: string;
}

export interface GitHubPRFile {
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
}

export interface ParsedGitHubPR {
  kind: "github-pr";
  title: string;
  author?: string;
  status?: string;
  body: string;
  files: GitHubPRFile[];
  comments: GitHubPRComment[];
  url?: string;
}

// --- Dashboard (summary mode for non-docs HTML) ---
export interface DashboardPanel {
  title?: string;
  values: string[];
  links?: string[];
}

export interface ParsedDashboard {
  kind: "dashboard";
  title: string;
  panels: DashboardPanel[];
  metrics: string[];
  links: DocsLink[];
}

// --- Table (CLI or delimited text) ---
export interface ParsedTable {
  kind: "table";
  raw: string;
  source: InputSource;
  format: "aligned" | "tab" | "csv" | "fallback";
  columns: string[];
  rows: string[][];
}

// --- Logs ---
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

export interface ParsedLogEntry {
  index: number;
  timestamp?: string;
  level: LogLevel;
  message: string;
  details: string[];
  raw: string;
}

export interface ParsedLogGroup {
  key: string;
  level: LogLevel;
  message: string;
  entries: ParsedLogEntry[];
  count: number;
  firstIndex: number;
  lastIndex: number;
  raw: string;
}

export interface ParsedLog {
  kind: "log";
  raw: string;
  source: InputSource;
  entries: ParsedLogEntry[];
  groups: ParsedLogGroup[];
  counts: Record<LogLevel, number>;
  firstFailureIndex: number;
  repeatedGroupCount: number;
}

// --- Diff ---
export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
  id: string;
  title: string;
  status: DiffStatus;
  category: "summary" | "path" | "section" | "row" | "issue" | "line";
  before?: string;
  after?: string;
  detail?: string;
}

export interface ParsedDiff {
  kind: "diff";
  title: string;
  summary: string;
  leftLabel: string;
  rightLabel: string;
  leftKind: AnyParsedKind;
  rightKind: AnyParsedKind;
  entries: DiffEntry[];
  stats: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

// --- Union and fallback ---
export type ParsedDocument =
  | ParsedDocs
  | ParsedJson
  | ParsedMarkdown
  | ParsedGitHubPR
  | ParsedDashboard
  | ParsedTable
  | ParsedLog
  | ParsedDiff;

export interface ParsedText {
  kind: "text";
  content: string;
  source: InputSource;
}

export type AnyParsed = ParsedDocument | ParsedText;
export type AnyParsedKind = AnyParsed["kind"];
