import type { InputSource, LogLevel, ParsedLog, ParsedLogEntry } from "../models.ts";

export function parseLog(raw: string, source: InputSource): ParsedLog {
  const lines = normalizeLines(raw).map((line) => stripAnsi(line));
  const entries: ParsedLogEntry[] = [];
  let current: ParsedLogEntry | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const parsedJsonLine = parseJsonLogLine(line);
    if (parsedJsonLine) {
      if (current) entries.push(current);
      current = parsedJsonLine;
      continue;
    }

    const parsedLine = parseStructuredLogLine(line);
    if (parsedLine) {
      if (current) entries.push(current);
      current = parsedLine;
      continue;
    }

    if (current && isContinuationLine(line)) {
      current.details.push(line);
      current.raw += `\n${line}`;
      continue;
    }

    if (current) entries.push(current);
    current = {
      level: "unknown",
      message: line,
      details: [],
      raw: line,
    };
  }

  if (current) entries.push(current);

  return {
    kind: "log",
    raw,
    source,
    entries,
    counts: countLevels(entries),
  };
}

export function looksLikeLog(raw: string): boolean {
  const lines = normalizeLines(raw)
    .map((line) => stripAnsi(line))
    .filter((line) => line.trim())
    .slice(0, 50);

  if (lines.length < 2) return false;

  let structuredMatches = 0;
  let timestampMatches = 0;
  let levelMatches = 0;
  let jsonMatches = 0;
  let continuationMatches = 0;

  for (const line of lines) {
    if (parseJsonLogLine(line)) {
      structuredMatches++;
      jsonMatches++;
      continue;
    }

    const parsed = parseStructuredLogLine(line);
    if (parsed) {
      structuredMatches++;
      if (parsed.timestamp) timestampMatches++;
      if (parsed.level !== "unknown") levelMatches++;
      continue;
    }

    if (isContinuationLine(line)) {
      continuationMatches++;
    }
  }

  if (jsonMatches >= 2) return true;
  if (structuredMatches >= 3 && structuredMatches / lines.length >= 0.35) return true;
  if (timestampMatches >= 2 && levelMatches >= 2) return true;
  if (levelMatches >= 3 && continuationMatches >= 1) return true;
  return false;
}

function parseJsonLogLine(line: string): ParsedLogEntry | null {
  const trimmed = line.trim();
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const message =
      firstString(parsed.message, parsed.msg, parsed.event, parsed.error, parsed.body)
      ?? trimmed;
    const timestamp = firstString(parsed.timestamp, parsed.time, parsed.ts, parsed.date);
    const level = normalizeLevel(firstString(parsed.level, parsed.severity, parsed.lvl));

    if (!timestamp && level === "unknown" && message === trimmed) return null;

    return {
      timestamp: timestamp ?? undefined,
      level,
      message,
      details: [],
      raw: line,
    };
  } catch {
    return null;
  }
}

function parseStructuredLogLine(line: string): ParsedLogEntry | null {
  const timestampFirst = line.match(
    /^\[?(\d{4}-\d{2}-\d{2}[T ][^\s\]]+|\d{4}\/\d{2}\/\d{2}[ T][^\s\]]+|\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?\s*(?:\[?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\]?[\s:|-]+)?(.*)$/i,
  );
  if (timestampFirst) {
    return {
      timestamp: timestampFirst[1] ?? undefined,
      level: normalizeLevel(timestampFirst[2]),
      message: (timestampFirst[3] || "").trim() || line.trim(),
      details: [],
      raw: line,
    };
  }

  const levelFirst = line.match(
    /^\[?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\]?(?:\s+|:\s*|-\s*)(.*)$/i,
  );
  if (levelFirst) {
    return {
      level: normalizeLevel(levelFirst[1]),
      message: (levelFirst[2] || "").trim() || line.trim(),
      details: [],
      raw: line,
    };
  }

  return null;
}

function isContinuationLine(line: string): boolean {
  return (
    /^\s+/.test(line) ||
    /^at\s/.test(line) ||
    /^Caused by:/i.test(line) ||
    /^\.\.\.\s+\d+\s+more$/.test(line)
  );
}

function normalizeLevel(level?: string | null): LogLevel {
  const normalized = (level ?? "").trim().toLowerCase();
  switch (normalized) {
    case "trace":
      return "trace";
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
    case "warning":
      return "warn";
    case "error":
      return "error";
    case "fatal":
      return "fatal";
    default:
      return "unknown";
  }
}

function countLevels(entries: ParsedLogEntry[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = {
    trace: 0,
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
    unknown: 0,
  };

  for (const entry of entries) {
    counts[entry.level] = (counts[entry.level] ?? 0) + 1;
  }

  return counts;
}

function normalizeLines(raw: string): string[] {
  return raw.replace(/\r\n?/g, "\n").split("\n");
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
